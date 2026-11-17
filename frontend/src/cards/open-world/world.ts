import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils'

const PLAY_RADIUS = 23
const RIM_START = 20
const WALK_SPEED = 3.15
const RUN_SPEED = 6.4
const GRAVITY = 18
const JUMP_SPEED = 8.1
const PLAYER_RADIUS = 0.36
const CAM_DIST = 6.4
const CAM_LOOK_Y = 1.32

export type Pose = {
    x: number
    y: number
    z: number
    yaw: number
    anim: number
}

export type WorldInput = {
    keyForward: number
    keyStrafe: number
    keyRun: boolean
    joyX: number
    joyY: number
    jump: boolean
    lookX: number
    lookY: number
}

export type WorldHandle = {
    dispose: () => void
    getPose: () => Pose
    setRemote: (pose: Pose) => void
}

type Circle = { x: number, z: number, r: number }
type AnimName = 'idle' | 'walk' | 'run' | 'jump'
type ClipSet = {
    idle: THREE.AnimationAction
    walk: THREE.AnimationAction
    run: THREE.AnimationAction
    jumpStart: THREE.AnimationAction
    jumpLoop: THREE.AnimationAction
    jumpLand: THREE.AnimationAction
}

const ANIM_INDEX: Record<AnimName, number> = { idle: 0, walk: 1, run: 2, jump: 3 }

export function mountWorld(
    canvas: HTMLCanvasElement,
    input: WorldInput,
    onReady: () => void
): WorldHandle {
    let disposed = false
    let raf = 0
    let pendingLoads = 2

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap()))
    renderer.outputEncoding = THREE.sRGBEncoding
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xd7eefc, 36, 92)

    const camera = new THREE.PerspectiveCamera(58, 1, 0.12, 280)
    const clock = new THREE.Clock()

    const hemi = new THREE.HemisphereLight(0xc5e4ff, 0x6d9348, 0.72)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.25)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.bias = -0.00035
    sun.shadow.normalBias = 0.04
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 48
    sun.shadow.camera.left = -16
    sun.shadow.camera.right = 16
    sun.shadow.camera.top = 16
    sun.shadow.camera.bottom = -16
    scene.add(sun)
    scene.add(sun.target)

    const sky = makeSky()
    scene.add(sky)
    const ground = makeGround()
    scene.add(ground)

    const colliders: Circle[] = []
    const pos = new THREE.Vector3(0, terrainHeight(0, 0), 0)
    let vy = 0
    let grounded = true
    let coyote = 0
    let jumpBuffer = 0
    let camYaw = 0.62
    let camPitch = 0.46
    let facing = camYaw + Math.PI
    let snapCam = true
    let anim: AnimName = 'idle'
    let jumpPhase: 'none' | 'start' | 'air' | 'land' = 'none'

    const localRoot = new THREE.Group()
    scene.add(localRoot)
    let localMixer: THREE.AnimationMixer = null
    let localClips: ClipSet = null
    let localCurrent: keyof ClipSet = 'idle'

    const remoteRoot = new THREE.Group()
    remoteRoot.visible = false
    scene.add(remoteRoot)
    let remoteMixer: THREE.AnimationMixer = null
    let remoteClips: ClipSet = null
    let remoteCurrent: keyof ClipSet = 'idle'
    let remoteFrom: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0 }
    let remoteTo: Pose = { x: 0, y: 0, z: 0, yaw: 0, anim: 0 }
    let remoteStart = 0
    let remoteHas = false

    const desiredCam = new THREE.Vector3()
    const loader = new GLTFLoader()

    loader.load(assetUrl('props.glb'), (gltf) => {
        if (disposed) return
        addProps(scene, gltf.scene, colliders)
        finishLoad()
    }, undefined, (err) => {
        console.error('Open World props failed to load', err)
        finishLoad()
    })

    loader.load(assetUrl('character.glb'), (gltf) => {
        if (disposed) return
        const built = adoptCharacter(gltf.scene, gltf.animations, false)
        localRoot.add(built.root)
        localMixer = built.mixer
        localClips = built.clips
        localClips.idle.play()
        const remote = adoptCharacter(SkeletonUtils.clone(gltf.scene), gltf.animations, true)
        remoteRoot.add(remote.root)
        remoteMixer = remote.mixer
        remoteClips = remote.clips
        remoteClips.idle.play()
        if (remoteHas) remoteRoot.visible = true
        finishLoad()
    }, undefined, (err) => {
        console.error('Open World character failed to load', err)
        localRoot.add(makeFallback())
        finishLoad()
    })

    function finishLoad(): void {
        pendingLoads -= 1
        if (pendingLoads <= 0 && !disposed) onReady()
    }

    function resize(): void {
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (width < 2 || height < 2) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    function frame(): void {
        raf = requestAnimationFrame(frame)
        if (document.hidden) return
        const dt = Math.min(0.05, clock.getDelta())
        step(dt)
        renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    function step(dt: number): void {
        camYaw -= input.lookX
        camPitch = clamp(camPitch + input.lookY, 0.18, 1.05)
        input.lookX = 0
        input.lookY = 0

        const keyMag = Math.hypot(input.keyForward, input.keyStrafe)
        const joyMag = Math.hypot(input.joyX, input.joyY)
        let forward = 0
        let strafe = 0
        let running = false
        if (keyMag >= joyMag && keyMag > 0) {
            forward = input.keyForward
            strafe = input.keyStrafe
            running = input.keyRun
        } else if (joyMag > 0) {
            forward = input.joyY
            strafe = input.joyX
            running = joyMag > 0.78
        }
        const moveMag = Math.min(1, Math.hypot(forward, strafe))
        const speed = (running ? RUN_SPEED : WALK_SPEED) * moveMag
        const forwardX = -Math.sin(camYaw)
        const forwardZ = -Math.cos(camYaw)
        const rightX = Math.cos(camYaw)
        const rightZ = -Math.sin(camYaw)
        const wishX = forwardX * forward + rightX * strafe
        const wishZ = forwardZ * forward + rightZ * strafe
        const wishLen = Math.hypot(wishX, wishZ)
        const moving = wishLen > 0.08 && speed > 0.15

        if (moving) {
            const dx = wishX / wishLen * speed * dt
            const dz = wishZ / wishLen * speed * dt
            tryMove(dx, dz)
            facing = dampAngle(facing, Math.atan2(wishX, wishZ), dt, 12)
        }

        if (input.jump) {
            jumpBuffer = 0.14
            input.jump = false
        } else {
            jumpBuffer = Math.max(0, jumpBuffer - dt)
        }
        coyote = grounded ? 0.12 : Math.max(0, coyote - dt)

        const groundY = terrainHeight(pos.x, pos.z)
        let justJumped = false
        if (jumpBuffer > 0 && (grounded || coyote > 0)) {
            vy = JUMP_SPEED
            grounded = false
            coyote = 0
            jumpBuffer = 0
            justJumped = true
        }
        if (!grounded) {
            vy -= GRAVITY * dt
            pos.y += vy * dt
            if (pos.y <= groundY) {
                pos.y = groundY
                vy = 0
                grounded = true
            }
        } else {
            pos.y = groundY
            vy = 0
        }

        localRoot.position.set(pos.x, pos.y, pos.z)
        localRoot.rotation.y = facing

        if (justJumped && localClips != null) {
            jumpPhase = 'start'
            anim = 'jump'
            fadeLocal('jumpStart')
        } else if (jumpPhase === 'start') {
            const action = localClips?.jumpStart
            if (action == null) jumpPhase = 'none'
            else if (action.time > Math.min(0.34, action.getClip().duration * 0.45)) {
                jumpPhase = 'air'
                fadeLocal('jumpLoop')
            }
        } else if (jumpPhase === 'air' && grounded) {
            jumpPhase = 'land'
            fadeLocal('jumpLand')
        } else if (jumpPhase === 'land') {
            const action = localClips?.jumpLand
            if (action == null || action.time > Math.min(0.42, action.getClip().duration * 0.55)) {
                jumpPhase = 'none'
            }
        }
        if (jumpPhase === 'none') {
            const next: AnimName = !moving ? 'idle' : running ? 'run' : 'walk'
            anim = next
            fadeLocal(next)
            if (localClips != null && moving) {
                const ref = next === 'run' ? RUN_SPEED : WALK_SPEED
                localClips[next].setEffectiveTimeScale(Math.max(0.65, speed / ref))
            }
        }
        localMixer?.update(dt)

        placeCamera(dt)
        sun.position.set(pos.x + 14, pos.y + 22, pos.z + 8)
        sun.target.position.set(pos.x, pos.y, pos.z)
        sun.target.updateMatrixWorld()
        sky.position.set(camera.position.x, 0, camera.position.z)
        updateRemote(dt)
    }

    function tryMove(dx: number, dz: number): void {
        if (canStand(pos.x + dx, pos.z + dz)) {
            pos.x += dx
            pos.z += dz
            return
        }
        if (canStand(pos.x + dx, pos.z)) pos.x += dx
        else if (canStand(pos.x, pos.z + dz)) pos.z += dz
    }

    function canStand(x: number, z: number): boolean {
        if (Math.hypot(x, z) > PLAY_RADIUS) return false
        const rise = terrainHeight(x, z) - terrainHeight(pos.x, pos.z)
        if (grounded && rise > 0.7) return false
        for (let i = 0; i < colliders.length; i++) {
            const c = colliders[i]
            const dx = x - c.x
            const dz = z - c.z
            const reach = c.r + PLAYER_RADIUS
            if (dx * dx + dz * dz < reach * reach) return false
        }
        return true
    }

    function fadeLocal(name: keyof ClipSet): void {
        if (localClips == null || localCurrent === name) return
        const next = localClips[name]
        const prev = localClips[localCurrent]
        next.reset().fadeIn(0.16).play()
        prev.fadeOut(0.16)
        localCurrent = name
    }

    function placeCamera(dt: number): void {
        const lookY = pos.y + CAM_LOOK_Y
        let dist = CAM_DIST
        const cp = Math.cos(camPitch)
        const sp = Math.sin(camPitch)
        for (let i = 0; i < 5; i++) {
            const x = pos.x + Math.sin(camYaw) * cp * dist
            const z = pos.z + Math.cos(camYaw) * cp * dist
            const y = lookY + sp * dist
            if (y > terrainHeight(x, z) + 0.4) break
            dist *= 0.75
        }
        desiredCam.set(
            pos.x + Math.sin(camYaw) * cp * dist,
            lookY + sp * dist,
            pos.z + Math.cos(camYaw) * cp * dist
        )
        if (snapCam) {
            camera.position.copy(desiredCam)
            snapCam = false
        } else {
            camera.position.lerp(desiredCam, 1 - Math.exp(-8 * dt))
        }
        camera.lookAt(pos.x, lookY, pos.z)
    }

    function updateRemote(dt: number): void {
        if (!remoteHas || remoteRoot.children.length === 0) return
        const k = clamp((performance.now() - remoteStart) / 140, 0, 1)
        const smooth = k * k * (3 - 2 * k)
        remoteRoot.position.set(
            remoteFrom.x + (remoteTo.x - remoteFrom.x) * smooth,
            remoteFrom.y + (remoteTo.y - remoteFrom.y) * smooth,
            remoteFrom.z + (remoteTo.z - remoteFrom.z) * smooth
        )
        remoteRoot.rotation.y = lerpAngle(remoteFrom.yaw, remoteTo.yaw, smooth)
        const next: keyof ClipSet = remoteTo.anim === 3 ? 'jumpLoop' : remoteTo.anim === 2 ? 'run' : remoteTo.anim === 1 ? 'walk' : 'idle'
        if (remoteClips != null && remoteCurrent !== next) {
            remoteClips[next].reset().fadeIn(0.16).play()
            remoteClips[remoteCurrent].fadeOut(0.16)
            remoteCurrent = next
        }
        remoteMixer?.update(dt)
    }

    function renderedRemote(): Pose {
        const k = clamp((performance.now() - remoteStart) / 140, 0, 1)
        const smooth = k * k * (3 - 2 * k)
        return {
            x: remoteFrom.x + (remoteTo.x - remoteFrom.x) * smooth,
            y: remoteFrom.y + (remoteTo.y - remoteFrom.y) * smooth,
            z: remoteFrom.z + (remoteTo.z - remoteFrom.z) * smooth,
            yaw: lerpAngle(remoteFrom.yaw, remoteTo.yaw, smooth),
            anim: remoteTo.anim,
        }
    }

    return {
        dispose(): void {
            disposed = true
            cancelAnimationFrame(raf)
            observer.disconnect()
            disposeScene(scene)
            renderer.dispose()
            renderer.forceContextLoss()
        },
        getPose(): Pose {
            return {
                x: round2(pos.x),
                y: round2(pos.y),
                z: round2(pos.z),
                yaw: round2(facing),
                anim: ANIM_INDEX[anim],
            }
        },
        setRemote(pose: Pose): void {
            if (remoteHas) remoteFrom = renderedRemote()
            else remoteFrom = pose
            remoteTo = pose
            remoteStart = performance.now()
            remoteHas = true
            if (remoteRoot.children.length > 0) remoteRoot.visible = true
        },
    }
}

function terrainHeight(x: number, z: number): number {
    const r = Math.hypot(x, z)
    const gentle =
        Math.sin(x * 0.15) * Math.cos(z * 0.13) * 0.25 +
        Math.sin(x * 0.05 + 2.0) * Math.sin(z * 0.055) * 0.38
    if (r <= RIM_START) return gentle
    const t = (r - RIM_START) / 6
    return gentle + Math.pow(t, 1.55) * 7
}

function makeGround(): THREE.Mesh {
    const size = 104
    const seg = 64
    const geo = new THREE.PlaneGeometry(size, size, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const positions = geo.attributes.position
    const colors = new Float32Array(positions.count * 3)
    const low = new THREE.Color('#4e9a3c')
    const high = new THREE.Color('#8bc85a')
    const bank = new THREE.Color('#c6ae74')
    low.convertSRGBToLinear()
    high.convertSRGBToLinear()
    bank.convertSRGBToLinear()
    const tint = new THREE.Color()
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i)
        const z = positions.getZ(i)
        const h = terrainHeight(x, z)
        positions.setY(i, h)
        const n = Math.sin(x * 0.47) * Math.cos(z * 0.41) * 0.5 + 0.5
        tint.copy(low).lerp(high, n)
        const r = Math.hypot(x, z)
        if (r > RIM_START) tint.lerp(bank, clamp((r - RIM_START) / 8, 0, 1))
        colors[i * 3] = tint.r
        colors[i * 3 + 1] = tint.g
        colors[i * 3 + 2] = tint.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const tex = makeGrassTexture()
    const mat = new THREE.MeshStandardMaterial({
        map: tex,
        vertexColors: true,
        roughness: 1,
        metalness: 0,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.name = 'ground'
    return mesh
}

function makeGrassTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#67a84a'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 1600; i++) {
        const x = Math.random() * 256
        const y = Math.random() * 256
        ctx.strokeStyle = Math.random() > 0.5 ? '#3f7d32' : '#8ec864'
        ctx.globalAlpha = 0.28
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (Math.random() - 0.5) * 2.5, y - 3 - Math.random() * 7)
        ctx.stroke()
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(46, 46)
    tex.encoding = THREE.sRGBEncoding
    tex.anisotropy = 4
    return tex
}

function makeSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(180, 20, 12)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const top = new THREE.Color('#6eb6f5')
    const horizon = new THREE.Color('#e7f6ff')
    const ground = new THREE.Color('#d5e7b0')
    top.convertSRGBToLinear()
    horizon.convertSRGBToLinear()
    ground.convertSRGBToLinear()
    const tint = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 180
        if (y > 0) tint.copy(horizon).lerp(top, clamp(y / 0.55, 0, 1))
        else tint.copy(ground).lerp(horizon, clamp((y + 0.25) / 0.25, 0, 1))
        colors[i * 3] = tint.r
        colors[i * 3 + 1] = tint.g
        colors[i * 3 + 2] = tint.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.renderOrder = -1
    return mesh
}

type Scatter = {
    name: string
    count: number
    minR: number
    maxR: number
    targetHeight: number
    scaleJitter: number
    gap: number
    collide: number
    castShadow: boolean
}

const SCATTER: Scatter[] = [
    { name: 'CommonTree_1', count: 11, minR: 6, maxR: 17.5, targetHeight: 6.4, scaleJitter: 0.18, gap: 3.4, collide: 0.62, castShadow: true },
    { name: 'CommonTree_5', count: 8, minR: 5, maxR: 17.2, targetHeight: 5.6, scaleJitter: 0.16, gap: 3.1, collide: 0.55, castShadow: true },
    { name: 'Rock_Medium_1', count: 9, minR: 3.5, maxR: 18.5, targetHeight: 0.85, scaleJitter: 0.28, gap: 1.6, collide: 0.42, castShadow: true },
    { name: 'Rock_Medium_3', count: 7, minR: 4, maxR: 19, targetHeight: 0.7, scaleJitter: 0.3, gap: 1.5, collide: 0.38, castShadow: true },
    { name: 'Flower_4_Single', count: 18, minR: 1.6, maxR: 16, targetHeight: 0.48, scaleJitter: 0.2, gap: 0.7, collide: 0, castShadow: false },
    { name: 'Flower_3_Single', count: 14, minR: 1.8, maxR: 16.5, targetHeight: 0.42, scaleJitter: 0.18, gap: 0.65, collide: 0, castShadow: false },
    { name: 'Grass_Common_Short', count: 36, minR: 1.2, maxR: 18, targetHeight: 0.55, scaleJitter: 0.25, gap: 0.45, collide: 0, castShadow: false },
    { name: 'Clover_1', count: 18, minR: 1.2, maxR: 17, targetHeight: 0.28, scaleJitter: 0.2, gap: 0.4, collide: 0, castShadow: false },
]

function addProps(scene: THREE.Scene, root: THREE.Object3D, colliders: Circle[]): void {
    root.updateMatrixWorld(true)
    const protos = new Map<string, PropProto>()
    for (let i = 0; i < root.children.length; i++) {
        const child = root.children[i]
        protos.set(child.name, prepareProto(child))
    }
    const rand = mulberry32(0x0e11d)
    const occupied: Circle[] = [{ x: 0, z: 0, r: 2.4 }]
    const dummy = new THREE.Object3D()

    // A few fixed pieces so the opening view always has a tree, a rock, and flowers nearby.
    const heroes: { name: string, x: number, z: number, yaw: number, height: number }[] = [
        { name: 'CommonTree_1', x: 5.2, z: 1.6, yaw: 0.4, height: 6.6 },
        { name: 'CommonTree_5', x: -6.4, z: 4.8, yaw: 1.2, height: 5.4 },
        { name: 'Rock_Medium_1', x: 2.4, z: 3.6, yaw: 0.8, height: 0.7 },
        { name: 'Flower_4_Single', x: 1.5, z: 1.7, yaw: 0.2, height: 0.5 },
        { name: 'Flower_3_Single', x: -1.4, z: 2.2, yaw: 1.4, height: 0.42 },
        { name: 'Grass_Common_Short', x: 0.8, z: -1.6, yaw: 0.5, height: 0.5 },
    ]
    for (let i = 0; i < heroes.length; i++) {
        const hero = heroes[i]
        const spec = SCATTER.find(item => item.name === hero.name)
        const proto = protos.get(hero.name)
        if (spec == null || proto == null) continue
        placeOne(protos, spec, hero.x, hero.z, hero.yaw, hero.height / proto.height, dummy, occupied, colliders)
    }

    for (let s = 0; s < SCATTER.length; s++) {
        const spec = SCATTER[s]
        const proto = protos.get(spec.name)
        if (proto == null) continue
        let placed = 0
        let guard = 0
        while (placed < spec.count && guard < spec.count * 40) {
            guard += 1
            const ang = rand() * Math.PI * 2
            const radius = spec.minR + Math.sqrt(rand()) * (spec.maxR - spec.minR)
            const x = Math.cos(ang) * radius
            const z = Math.sin(ang) * radius
            if (terrainHeight(x, z) > 1.1) continue
            if (tooClose(occupied, x, z, spec.gap)) continue
            const scale = (spec.targetHeight / proto.height) * (1 + (rand() - 0.5) * 2 * spec.scaleJitter)
            placeOne(protos, spec, x, z, rand() * Math.PI * 2, scale, dummy, occupied, colliders)
            placed += 1
        }
        for (let p = 0; p < proto.parts.length; p++) {
            const mesh = proto.parts[p].mesh
            mesh.instanceMatrix.needsUpdate = true
            mesh.frustumCulled = false
            if (spec.castShadow && !proto.parts[p].cutout) {
                mesh.castShadow = true
                mesh.receiveShadow = true
            }
            if (mesh.parent == null) scene.add(mesh)
        }
    }
}

type ProtoPart = {
    mesh: THREE.InstancedMesh
    cutout: boolean
}
type PropProto = {
    height: number
    parts: ProtoPart[]
    cursor: number
    capacity: number
}

function prepareProto(node: THREE.Object3D): PropProto {
    const geoms: THREE.BufferGeometry[] = []
    const mats: THREE.Material[] = []
    node.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        const geom = mesh.geometry.clone()
        geom.applyMatrix4(mesh.matrixWorld)
        geoms.push(geom)
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        tuneMaterial(mat, node.name)
        mats.push(mat)
        mesh.geometry.dispose()
    })
    const box = new THREE.Box3()
    for (let i = 0; i < geoms.length; i++) {
        geoms[i].computeBoundingBox()
        box.union(geoms[i].boundingBox)
    }
    const height = Math.max(0.001, box.max.y - box.min.y)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    const capacity = countFor(node.name) + 4
    const parts: ProtoPart[] = []
    for (let i = 0; i < geoms.length; i++) {
        geoms[i].translate(-cx, -box.min.y, -cz)
        const mesh = new THREE.InstancedMesh(geoms[i], mats[i], capacity)
        mesh.count = 0
        parts.push({ mesh, cutout: isCutoutName(mats[i].name) || isCutoutName(node.name) })
    }
    return { height, parts, cursor: 0, capacity }
}

function countFor(name: string): number {
    let total = 0
    for (let i = 0; i < SCATTER.length; i++) if (SCATTER[i].name === name) total += SCATTER[i].count
    return total + 8
}

function placeOne(
    protos: Map<string, PropProto>,
    spec: Scatter,
    x: number,
    z: number,
    yaw: number,
    scale: number,
    dummy: THREE.Object3D,
    occupied: Circle[],
    colliders: Circle[]
): void {
    const proto = protos.get(spec.name)
    if (proto == null || proto.cursor >= proto.capacity) return
    const y = terrainHeight(x, z)
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, yaw, 0)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    const index = proto.cursor
    for (let p = 0; p < proto.parts.length; p++) {
        const mesh = proto.parts[p].mesh
        mesh.setMatrixAt(index, dummy.matrix)
        mesh.count = index + 1
    }
    proto.cursor += 1
    occupied.push({ x, z, r: spec.gap })
    if (spec.collide > 0) {
        const base = spec.targetHeight / proto.height
        colliders.push({ x, z, r: spec.collide * (scale / base) })
    }
}

function tuneMaterial(mat: THREE.Material, nodeName: string): void {
    const standard = mat as THREE.MeshStandardMaterial
    const cutout = isCutoutName(standard.name) || isCutoutName(nodeName)
    standard.metalness = 0
    standard.roughness = 1
    standard.transparent = false
    if (cutout) {
        standard.alphaTest = 0.4
        standard.side = THREE.DoubleSide
        standard.depthWrite = true
    } else {
        standard.alphaTest = 0
        standard.side = THREE.FrontSide
    }
    if (standard.map != null) {
        standard.map.encoding = THREE.sRGBEncoding
        standard.map.anisotropy = 4
    }
}

function isCutoutName(name: string): boolean {
    return /leaf|flower|grass|clover/i.test(name || '')
}

function tooClose(circles: Circle[], x: number, z: number, gap: number): boolean {
    for (let i = 0; i < circles.length; i++) {
        const c = circles[i]
        const dx = x - c.x
        const dz = z - c.z
        const reach = gap + c.r * 0.35
        if (dx * dx + dz * dz < reach * reach) return true
    }
    return false
}

function adoptCharacter(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    tintRemote: boolean
): { root: THREE.Object3D, mixer: THREE.AnimationMixer, clips: ClipSet } {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        if (!tintRemote) return
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = list.map((mat) => {
            const copy = mat.clone() as THREE.MeshStandardMaterial
            if (copy.name === 'M_Main') copy.color.set('#3c7de0').convertSRGBToLinear()
            if (copy.name === 'M_Joints') copy.color.set('#f2d56a').convertSRGBToLinear()
            return copy
        })
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
    })
    const mixer = new THREE.AnimationMixer(root)
    const byName = (name: string): THREE.AnimationClip => {
        const found = animations.find(clip => clip.name === name)
        if (found != null) return found
        return animations[0]
    }
    const once = (clip: THREE.AnimationClip): THREE.AnimationAction => {
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
        return action
    }
    const loop = (clip: THREE.AnimationClip): THREE.AnimationAction => {
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopRepeat, Infinity)
        return action
    }
    return {
        root,
        mixer,
        clips: {
            idle: loop(byName('Idle_Loop')),
            walk: loop(byName('Walk_Loop')),
            run: loop(byName('Sprint_Loop')),
            jumpStart: once(byName('Jump_Start')),
            jumpLoop: loop(byName('Jump_Loop')),
            jumpLand: once(byName('Jump_Land')),
        },
    }
}

function makeFallback(): THREE.Group {
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: 0xcc7a2e, roughness: 0.55 })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.05, 12), mat)
    body.position.y = 0.85
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat)
    head.position.y = 1.55
    head.castShadow = true
    group.add(body, head)
    return group
}

function disposeScene(scene: THREE.Scene): void {
    const seen = new Set<unknown>()
    scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        disposeOnce(seen, mesh.geometry)
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (let i = 0; i < mats.length; i++) {
            const mat = mats[i] as THREE.MeshStandardMaterial
            disposeOnce(seen, mat.map)
            disposeOnce(seen, mat)
        }
    })
}

function disposeOnce(seen: Set<unknown>, resource: { dispose?: () => void }): void {
    if (resource == null || resource.dispose == null || seen.has(resource)) return
    seen.add(resource)
    resource.dispose()
}

function assetUrl(file: string): string {
    return '/open-world/' + file
}

function pixelRatioCap(): number {
    const nav = navigator as Navigator & { deviceMemory?: number }
    const mem = nav.deviceMemory
    const cores = navigator.hardwareConcurrency || 8
    if ((mem != null && mem <= 4) || cores <= 4) return 1.25
    return 1.5
}

function mulberry32(seed: number): () => number {
    let state = seed
    return () => {
        state |= 0
        state = state + 0x6D2B79F5 | 0
        let t = Math.imul(state ^ state >>> 15, 1 | state)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

function dampAngle(current: number, target: number, dt: number, lambda: number): number {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
    return current + delta * (1 - Math.exp(-lambda * dt))
}

function lerpAngle(a: number, b: number, t: number): number {
    return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
    return Math.round(value * 100) / 100
}
