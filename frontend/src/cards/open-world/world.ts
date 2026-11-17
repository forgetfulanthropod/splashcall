import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils'
import {
    accessoryBone,
    cloneProp,
    findBone,
    makeAccessory,
    makeBolt,
    makeCreature,
    makeHealthBar,
    makeWeapon,
    setFlash,
    standOnGround,
} from './actors'
import {
    ASSET_INFO,
    buildGrassPixels,
    buildPlacements,
    Placement,
    practiceWorlds,
    sanitizePlacements,
    TEXTURE_SIZE,
    textureSeed,
    WorldSpec,
} from './spec'

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
    attack: boolean
    lookX: number
    lookY: number
}

export type PlayerState = {
    x: number
    y: number
    z: number
    yaw: number
    health: number
}

export type WorldStatus = {
    health: number
    maxHealth: number
    respawned: boolean
}

export type MountOptions = {
    spec?: WorldSpec
    player?: PlayerState | null
    texturePixels?: Uint8Array | null
    placements?: Placement[] | null
    onReady?: () => void
    onStatus?: (status: WorldStatus) => void
}

export type WorldHandle = {
    dispose: () => void
    getPose: () => Pose
    setRemote: (pose: Pose) => void
    getPlayerState: () => PlayerState
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

const PLAYER_MAX_HEALTH = 100

export function mountWorld(
    canvas: HTMLCanvasElement,
    input: WorldInput,
    onReadyOrOptions?: (() => void) | MountOptions
): WorldHandle {
    const options: MountOptions = typeof onReadyOrOptions === 'function'
        ? { onReady: onReadyOrOptions }
        : (onReadyOrOptions == null ? {} : onReadyOrOptions)
    const spec: WorldSpec = options.spec == null ? practiceWorlds()[0] : options.spec
    const onReady = options.onReady == null ? (): void => undefined : options.onReady
    const placements = options.placements == null
        ? buildPlacements(spec)
        : sanitizePlacements(options.placements, spec)
    const texturePixels = options.texturePixels != null && options.texturePixels.byteLength === TEXTURE_SIZE * TEXTURE_SIZE * 4
        ? options.texturePixels
        : buildGrassPixels(spec.palette, textureSeed(spec))
    const heightAt = (x: number, z: number): number => terrainHeight(x, z, spec.hills)
    const rangedWeapon = spec.weapon.type === 'bow' || spec.weapon.type === 'blaster'

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
    const fogColor = new THREE.Color(spec.palette.fog).convertSRGBToLinear()
    scene.fog = new THREE.Fog(fogColor, 36, 92)
    scene.background = fogColor

    const camera = new THREE.PerspectiveCamera(58, 1, 0.12, 280)
    const clock = new THREE.Clock()

    const hemi = new THREE.HemisphereLight(spec.sky.top, spec.palette.low, 0.72)
    hemi.color.convertSRGBToLinear()
    hemi.groundColor.convertSRGBToLinear()
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

    const sky = makeSky(spec.sky)
    scene.add(sky)
    const ground = makeGround(spec, texturePixels)
    scene.add(ground)

    const colliders: Circle[] = []
    const spawn = options.player
    const spawnX = spawn == null ? 0 : clamp(spawn.x, -PLAY_RADIUS + 1, PLAY_RADIUS - 1)
    const spawnZ = spawn == null ? 0 : clamp(spawn.z, -PLAY_RADIUS + 1, PLAY_RADIUS - 1)
    const pos = new THREE.Vector3(spawnX, heightAt(spawnX, spawnZ), spawnZ)
    let health = spawn == null ? PLAYER_MAX_HEALTH : clamp(spawn.health, 1, PLAYER_MAX_HEALTH)
    let hurtWait = 0
    let attackWait = 0
    let swing = 0
    let statusHealth = -1
    let respawnPulse = false
    const weaponPivot = makeWeapon(spec.weapon)
    weaponPivot.position.set(0.34, 0.92, 0.22)
    let vy = 0
    let grounded = true
    let coyote = 0
    let jumpBuffer = 0
    const savedYaw = spawn != null && Number.isFinite(spawn.yaw) ? spawn.yaw : null
    let camYaw = savedYaw == null ? 0.62 : savedYaw - Math.PI
    let camPitch = 0.46
    let facing = savedYaw == null ? camYaw + Math.PI : savedYaw
    let snapCam = true
    let anim: AnimName = 'idle'
    let jumpPhase: 'none' | 'start' | 'air' | 'land' = 'none'

    const localRoot = new THREE.Group()
    localRoot.scale.setScalar(spec.player.scale)
    localRoot.add(weaponPivot)
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
    let characterTemplate: { scene: THREE.Group, animations: THREE.AnimationClip[] } | null = null
    let rockTemplate: THREE.Object3D | null = null
    const enemies: Enemy[] = []
    const projectiles: Bolt[] = []

    loader.load(assetUrl('props.glb'), (gltf) => {
        if (disposed) return
        rockTemplate = cloneProp(gltf.scene, 'Rock_Medium_1')
        addProps(scene, gltf.scene, colliders, placements, spec.hills)
        finishLoad()
    }, undefined, (err) => {
        console.error('Open World props failed to load', err)
        finishLoad()
    })

    loader.load(assetUrl('character.glb'), (gltf) => {
        if (disposed) return
        characterTemplate = { scene: SkeletonUtils.clone(gltf.scene) as THREE.Group, animations: gltf.animations }
        const look = playerLook(spec)
        const built = adoptCharacter(gltf.scene, gltf.animations, look)
        localRoot.add(built.root)
        localMixer = built.mixer
        localClips = built.clips
        localClips.idle.play()
        const accessory = makeAccessory(spec.player.accessory, spec.player.tint)
        if (accessory != null) {
            const bone = findBone(built.root, accessoryBone(spec.player.accessory))
            ;(bone == null ? built.root : bone).add(accessory)
        }
        const remote = adoptCharacter(SkeletonUtils.clone(characterTemplate.scene), characterTemplate.animations, { main: '#3c7de0', joint: '#f2d56a' })
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
        if (pendingLoads > 0 || disposed) return
        spawnEnemies()
        onReady()
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

        const groundY = heightAt(pos.x, pos.z)
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
        stepCombat(dt)
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
        const rise = heightAt(x, z) - heightAt(pos.x, pos.z)
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
        const lookY = pos.y + CAM_LOOK_Y * spec.player.scale
        let dist = CAM_DIST
        const cp = Math.cos(camPitch)
        const sp = Math.sin(camPitch)
        for (let i = 0; i < 5; i++) {
            const x = pos.x + Math.sin(camYaw) * cp * dist
            const z = pos.z + Math.cos(camYaw) * cp * dist
            const y = lookY + sp * dist
            if (y > heightAt(x, z) + 0.4) break
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

    function publishStatus(): void {
        const rounded = Math.max(0, Math.round(health))
        const respawned = respawnPulse
        respawnPulse = false
        if (!respawned && rounded === statusHealth) return
        statusHealth = rounded
        if (options.onStatus != null) options.onStatus({ health: rounded, maxHealth: PLAYER_MAX_HEALTH, respawned })
    }

    function stepCombat(dt: number): void {
        hurtWait = Math.max(0, hurtWait - dt)
        attackWait = Math.max(0, attackWait - dt)
        swing = Math.max(0, swing - dt / 0.22)
        const swingAngle = Math.sin((1 - swing) * Math.PI) * (rangedWeapon ? 0.25 : 1.35)
        weaponPivot.rotation.z = -swingAngle
        setFlash(localRoot, hurtWait > 0 ? 1 : 0)

        if (input.attack && attackWait <= 0 && health > 0) {
            input.attack = false
            attackWait = rangedWeapon ? (spec.weapon.type === 'blaster' ? 0.28 : 0.5) : (spec.weapon.type === 'staff' ? 0.62 : 0.42)
            swing = 1
            if (rangedWeapon) fireBolt('player', pos.x, pos.z, facing, spec.weapon.damage, 16, spec.weapon.range / 16 + 0.05, spec.weapon.color, 0.12)
            else melee()
        } else if (input.attack) {
            input.attack = false
        }

        for (let i = 0; i < enemies.length; i++) stepEnemy(enemies[i], dt, i)
        stepBolts(dt)
        publishStatus()
    }

    function melee(): void {
        const fx = Math.sin(facing)
        const fz = Math.cos(facing)
        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i]
            if (!enemy.alive) continue
            const dx = enemy.x - pos.x
            const dz = enemy.z - pos.z
            const dist = Math.hypot(dx, dz)
            if (dist > spec.weapon.range + 0.5) continue
            const dot = dist < 0.05 ? 1 : (dx / dist) * fx + (dz / dist) * fz
            if (dot < 0.15) continue
            hurtEnemy(enemy, spec.weapon.damage)
        }
    }

    function fireBolt(
        team: 'player' | 'enemy',
        x: number,
        z: number,
        yaw: number,
        damage: number,
        speed: number,
        ttl: number,
        color: string,
        radius: number
    ): void {
        const mesh = makeBolt(color, radius)
        scene.add(mesh)
        const ox = x + Math.sin(yaw) * 0.55
        const oz = z + Math.cos(yaw) * 0.55
        projectiles.push({
            mesh,
            x: ox,
            z: oz,
            y: heightAt(ox, oz) + 1.05,
            vx: Math.sin(yaw) * speed,
            vz: Math.cos(yaw) * speed,
            damage,
            ttl,
            team,
        })
    }

    function stepEnemy(enemy: Enemy, dt: number, index: number): void {
        if (!enemy.alive) {
            enemy.respawn -= dt
            enemy.root.visible = false
            enemy.bar.visible = false
            if (enemy.respawn <= 0) reviveEnemy(enemy, index)
            return
        }
        const dx = pos.x - enemy.x
        const dz = pos.z - enemy.z
        const dist = Math.hypot(dx, dz)
        enemy.goalT -= dt
        let wishX = 0
        let wishZ = 0
        if (enemy.behavior === 'chase' && dist < 14) {
            wishX = dx
            wishZ = dz
        } else if (enemy.behavior === 'ranged') {
            if (dist > 8.5) {
                wishX = dx
                wishZ = dz
            } else if (dist < 4.2) {
                wishX = -dx
                wishZ = -dz
            }
            enemy.attackWait -= dt
            if (dist < 12 && dist > 3.2 && enemy.attackWait <= 0) {
                const aim = Math.atan2(dx, dz)
                fireBolt('enemy', enemy.x, enemy.z, aim, enemy.damage, 8, 1.5, enemy.tint, 0.16)
                enemy.attackWait = 1.7
            }
        } else {
            if (enemy.goalT <= 0) {
                const ang = Math.random() * Math.PI * 2
                const radius = 4 + Math.random() * 11
                enemy.goalX = Math.cos(ang) * radius
                enemy.goalZ = Math.sin(ang) * radius
                enemy.goalT = 1.6 + Math.random() * 2.2
            }
            wishX = enemy.goalX - enemy.x
            wishZ = enemy.goalZ - enemy.z
        }
        const wishLen = Math.hypot(wishX, wishZ)
        let moving = false
        if (wishLen > 0.35) {
            const stepX = wishX / wishLen * enemy.speed * dt
            const stepZ = wishZ / wishLen * enemy.speed * dt
            if (enemyCanStand(enemy.x + stepX, enemy.z + stepZ)) {
                enemy.x += stepX
                enemy.z += stepZ
                moving = true
            } else {
                enemy.goalT = 0
            }
            enemy.yaw = Math.atan2(wishX, wishZ)
        }
        separateEnemy(enemy)
        if (enemy.behavior !== 'ranged' && dist < 0.9 + enemy.scale * 0.28) {
            enemy.attackWait -= dt
            if (enemy.attackWait <= 0) {
                damagePlayer(enemy.damage, enemy.x, enemy.z)
                enemy.attackWait = 0.95
            }
        }
        enemy.flash = Math.max(0, enemy.flash - dt)
        setFlash(enemy.root, enemy.flash > 0 ? 1 : 0)
        const y = heightAt(enemy.x, enemy.z)
        const bob = enemy.model === 'procedural' ? Math.sin(clock.elapsedTime * 3 + index) * 0.06 : 0
        enemy.root.position.set(enemy.x, y + bob, enemy.z)
        enemy.root.rotation.y = enemy.yaw
        enemy.root.visible = true
        if (enemy.idle != null && enemy.walk != null && enemy.wasMoving !== moving) {
            const next = moving ? enemy.walk : enemy.idle
            const prev = moving ? enemy.idle : enemy.walk
            next.reset().fadeIn(0.16).play()
            prev.fadeOut(0.16)
            enemy.wasMoving = moving
        }
        enemy.mixer?.update(dt)
        const barY = y + 1.45 * enemy.scale + 0.35
        enemy.bar.position.set(enemy.x, barY, enemy.z)
        enemy.bar.quaternion.copy(camera.quaternion)
        enemy.bar.visible = enemy.health < enemy.maxHealth
        const ratio = clamp(enemy.health / enemy.maxHealth, 0, 1)
        enemy.barFill.scale.x = Math.max(0.04, ratio)
        enemy.barFill.position.x = -(1 - ratio) * 0.42
    }

    function separateEnemy(enemy: Enemy): void {
        for (let i = 0; i < enemies.length; i++) {
            const other = enemies[i]
            if (other === enemy || !other.alive) continue
            const dx = enemy.x - other.x
            const dz = enemy.z - other.z
            const dist = Math.hypot(dx, dz)
            const min = 0.7 * (enemy.scale + other.scale)
            if (dist >= min || dist < 0.0001) continue
            const push = (min - dist) * 0.35
            const nx = enemy.x + (dx / dist) * push
            const nz = enemy.z + (dz / dist) * push
            if (enemyCanStand(nx, nz)) {
                enemy.x = nx
                enemy.z = nz
            }
        }
    }

    function stepBolts(dt: number): void {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const bolt = projectiles[i]
            bolt.ttl -= dt
            bolt.x += bolt.vx * dt
            bolt.z += bolt.vz * dt
            bolt.y = heightAt(bolt.x, bolt.z) + 1.05
            bolt.mesh.position.set(bolt.x, bolt.y, bolt.z)
            let hit = bolt.ttl <= 0 || Math.hypot(bolt.x, bolt.z) > PLAY_RADIUS + 1
            if (!hit && bolt.team === 'player') {
                for (let e = 0; e < enemies.length; e++) {
                    const enemy = enemies[e]
                    if (!enemy.alive) continue
                    const reach = 0.5 + enemy.scale * 0.2
                    if (Math.hypot(enemy.x - bolt.x, enemy.z - bolt.z) <= reach) {
                        hurtEnemy(enemy, bolt.damage)
                        hit = true
                        break
                    }
                }
            } else if (!hit) {
                if (Math.hypot(pos.x - bolt.x, pos.z - bolt.z) <= 0.55) {
                    damagePlayer(bolt.damage, bolt.x, bolt.z)
                    hit = true
                }
            }
            if (!hit) continue
            scene.remove(bolt.mesh)
            disposeOnce(new Set(), bolt.mesh.geometry)
            disposeOnce(new Set(), bolt.mesh.material as THREE.Material)
            projectiles.splice(i, 1)
        }
    }

    function damagePlayer(amount: number, fromX: number, fromZ: number): void {
        if (hurtWait > 0 || health <= 0) return
        health = Math.max(0, health - amount)
        hurtWait = 0.55
        const away = Math.atan2(pos.x - fromX, pos.z - fromZ)
        const nx = pos.x + Math.sin(away) * 0.42
        const nz = pos.z + Math.cos(away) * 0.42
        if (canStand(nx, nz)) {
            pos.x = nx
            pos.z = nz
        }
        if (health <= 0) respawnPlayer()
    }

    function respawnPlayer(): void {
        pos.set(0, heightAt(0, 0), 0)
        vy = 0
        grounded = true
        health = PLAYER_MAX_HEALTH
        hurtWait = 1.7
        respawnPulse = true
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const bolt = projectiles[i]
            if (bolt.team === 'player') continue
            scene.remove(bolt.mesh)
            disposeOnce(new Set(), bolt.mesh.geometry)
            disposeOnce(new Set(), bolt.mesh.material as THREE.Material)
            projectiles.splice(i, 1)
        }
    }

    function hurtEnemy(enemy: Enemy, amount: number): void {
        if (!enemy.alive) return
        enemy.health -= amount
        enemy.flash = 0.16
        if (enemy.health > 0) return
        enemy.alive = false
        enemy.health = 0
        enemy.respawn = 4.5
        enemy.root.visible = false
        enemy.bar.visible = false
    }

    function reviveEnemy(enemy: Enemy, index: number): void {
        const spot = enemySpot(index + enemies.length + Math.floor(Math.random() * 5))
        enemy.x = spot.x
        enemy.z = spot.z
        enemy.health = enemy.maxHealth
        enemy.alive = true
        enemy.respawn = 0
        enemy.attackWait = 0.6
        enemy.root.visible = true
    }

    function enemyCanStand(x: number, z: number): boolean {
        if (Math.hypot(x, z) > PLAY_RADIUS - 0.4) return false
        for (let i = 0; i < colliders.length; i++) {
            const c = colliders[i]
            const dx = x - c.x
            const dz = z - c.z
            if (dx * dx + dz * dz < (c.r + 0.3) * (c.r + 0.3)) return false
        }
        return true
    }

    function spawnEnemies(): void {
        let index = 0
        for (let k = 0; k < spec.enemies.length; k++) {
            const kind = spec.enemies[k]
            for (let n = 0; n < kind.count; n++) {
                const spot = enemySpot(index)
                const root = new THREE.Group()
                root.scale.setScalar(kind.scale)
                let mixer: THREE.AnimationMixer | null = null
                let idle: THREE.AnimationAction | null = null
                let walk: THREE.AnimationAction | null = null
                if (kind.model === 'character' && characterTemplate != null) {
                    const built = adoptCharacter(
                        SkeletonUtils.clone(characterTemplate.scene),
                        characterTemplate.animations,
                        { main: kind.tint, joint: jointTint(kind.tint) }
                    )
                    root.add(built.root)
                    mixer = built.mixer
                    idle = built.clips.idle
                    walk = built.clips.walk
                    idle.play()
                } else if (kind.model === 'rock' && rockTemplate != null) {
                    const rock = rockTemplate.clone(true)
                    standOnGround(rock, 1.15)
                    root.add(rock)
                } else {
                    root.add(makeCreature(kind.tint))
                }
                scene.add(root)
                const bar = makeHealthBar()
                scene.add(bar.group)
                const enemy: Enemy = {
                    behavior: kind.behavior,
                    model: kind.model,
                    tint: kind.tint,
                    maxHealth: kind.health,
                    health: kind.health,
                    speed: kind.speed,
                    damage: kind.damage,
                    scale: kind.scale,
                    x: spot.x,
                    z: spot.z,
                    yaw: Math.random() * Math.PI * 2,
                    alive: true,
                    respawn: 0,
                    goalX: spot.x,
                    goalZ: spot.z,
                    goalT: 0.4,
                    attackWait: 0.8,
                    flash: 0,
                    root,
                    mixer,
                    idle,
                    walk,
                    wasMoving: false,
                    bar: bar.group,
                    barFill: bar.fill,
                }
                root.position.set(spot.x, heightAt(spot.x, spot.z), spot.z)
                enemies.push(enemy)
                index += 1
            }
        }
    }

    function enemySpot(index: number): { x: number, z: number } {
        const ang = index * 2.399963 + 0.7
        const radius = 7.2 + (index % 5) * 1.6
        return { x: Math.cos(ang) * radius, z: Math.sin(ang) * radius }
    }

    return {
        dispose(): void {
            disposed = true
            cancelAnimationFrame(raf)
            observer.disconnect()
            disposeScene(scene)
            renderer.dispose()
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
        getPlayerState(): PlayerState {
            return {
                x: round2(pos.x),
                y: round2(pos.y),
                z: round2(pos.z),
                yaw: round2(facing),
                health: Math.max(0, Math.round(health)),
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

type Enemy = {
    behavior: WorldSpec['enemies'][number]['behavior']
    model: WorldSpec['enemies'][number]['model']
    tint: string
    maxHealth: number
    health: number
    speed: number
    damage: number
    scale: number
    x: number
    z: number
    yaw: number
    alive: boolean
    respawn: number
    goalX: number
    goalZ: number
    goalT: number
    attackWait: number
    flash: number
    root: THREE.Group
    mixer: THREE.AnimationMixer | null
    idle: THREE.AnimationAction | null
    walk: THREE.AnimationAction | null
    wasMoving: boolean
    bar: THREE.Group
    barFill: THREE.Mesh
}

type Bolt = {
    mesh: THREE.Mesh
    x: number
    y: number
    z: number
    vx: number
    vz: number
    damage: number
    ttl: number
    team: 'player' | 'enemy'
}

type CharacterLook = { main: string | null, joint: string | null }

function playerLook(spec: WorldSpec): CharacterLook {
    if (spec.player.tint === 'keep') return { main: null, joint: null }
    return { main: spec.player.tint, joint: jointTint(spec.player.tint) }
}

function jointTint(tint: string): string {
    const hex = tint.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const mix = (channel: number, toward: number): string =>
        Math.round(channel * 0.55 + toward * 0.45).toString(16).padStart(2, '0')
    return '#' + mix(r, 0xf2) + mix(g, 0xd5) + mix(b, 0x6a)
}

function terrainHeight(x: number, z: number, hills = 0.35): number {
    const r = Math.hypot(x, z)
    const amp = 0.65 + hills * 0.9
    const gentle =
        Math.sin(x * 0.15) * Math.cos(z * 0.13) * 0.25 * amp +
        Math.sin(x * 0.05 + 2.0) * Math.sin(z * 0.055) * 0.38 * amp
    if (r <= RIM_START) return gentle
    const t = (r - RIM_START) / 6
    return gentle + Math.pow(t, 1.55) * 7
}

function makeGround(spec: WorldSpec, pixels: Uint8Array): THREE.Mesh {
    const size = 104
    const seg = 64
    const geo = new THREE.PlaneGeometry(size, size, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const positions = geo.attributes.position
    const colors = new Float32Array(positions.count * 3)
    const low = new THREE.Color(spec.palette.low)
    const high = new THREE.Color(spec.palette.high)
    const bank = new THREE.Color(spec.palette.rock)
    low.convertSRGBToLinear()
    high.convertSRGBToLinear()
    bank.convertSRGBToLinear()
    const tint = new THREE.Color()
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i)
        const z = positions.getZ(i)
        const h = terrainHeight(x, z, spec.hills)
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
    const tex = textureFromPixels(pixels)
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

function textureFromPixels(pixels: Uint8Array): THREE.DataTexture {
    const tex = new THREE.DataTexture(pixels, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(32, 32)
    tex.encoding = THREE.sRGBEncoding
    tex.anisotropy = 4
    tex.flipY = true
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    return tex
}

function makeSky(sky: WorldSpec['sky']): THREE.Mesh {
    const geo = new THREE.SphereGeometry(180, 20, 12)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const top = new THREE.Color(sky.top)
    const horizon = new THREE.Color(sky.horizon)
    const ground = new THREE.Color(sky.ground)
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

function addProps(
    scene: THREE.Scene,
    root: THREE.Object3D,
    colliders: Circle[],
    placements: Placement[],
    hills: number
): void {
    root.updateMatrixWorld(true)
    const counts = new Map<string, number>()
    for (let i = 0; i < placements.length; i++) {
        const name = placements[i].asset
        counts.set(name, (counts.get(name) || 0) + 1)
    }
    const protos = new Map<string, PropProto>()
    for (let i = 0; i < root.children.length; i++) {
        const child = root.children[i]
        const count = counts.get(child.name) || 0
        if (count === 0) continue
        protos.set(child.name, prepareProto(child, count))
    }
    const dummy = new THREE.Object3D()
    for (let i = 0; i < placements.length; i++) {
        const spot = placements[i]
        const info = ASSET_INFO[spot.asset]
        const proto = protos.get(spot.asset)
        if (info == null || proto == null) continue
        const scale = (info.targetHeight / proto.height) * spot.scale
        placeOne(proto, info, spot.x, spot.z, spot.yaw, scale, hills, dummy, colliders)
    }
    protos.forEach((proto) => {
        for (let p = 0; p < proto.parts.length; p++) {
            const mesh = proto.parts[p].mesh
            mesh.instanceMatrix.needsUpdate = true
            mesh.frustumCulled = false
            if (proto.castShadow && !proto.parts[p].cutout) {
                mesh.castShadow = true
                mesh.receiveShadow = true
            }
            if (mesh.parent == null) scene.add(mesh)
        }
    })
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
    castShadow: boolean
}

function prepareProto(node: THREE.Object3D, capacity: number): PropProto {
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
    const info = ASSET_INFO[node.name as Placement['asset']]
    const parts: ProtoPart[] = []
    for (let i = 0; i < geoms.length; i++) {
        geoms[i].translate(-cx, -box.min.y, -cz)
        const mesh = new THREE.InstancedMesh(geoms[i], mats[i], capacity)
        mesh.count = 0
        parts.push({ mesh, cutout: isCutoutName(mats[i].name) || isCutoutName(node.name) })
    }
    return { height, parts, cursor: 0, capacity, castShadow: info == null ? true : info.castShadow }
}

function placeOne(
    proto: PropProto,
    info: { collide: number, targetHeight: number },
    x: number,
    z: number,
    yaw: number,
    scale: number,
    hills: number,
    dummy: THREE.Object3D,
    colliders: Circle[]
): void {
    if (proto.cursor >= proto.capacity) return
    const y = terrainHeight(x, z, hills)
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
    if (info.collide > 0) {
        const base = info.targetHeight / proto.height
        colliders.push({ x, z, r: info.collide * (scale / Math.max(0.001, base)) })
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

function adoptCharacter(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    look: CharacterLook
): { root: THREE.Object3D, mixer: THREE.AnimationMixer, clips: ClipSet } {
    root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = list.map((mat) => {
            const copy = mat.clone() as THREE.MeshStandardMaterial
            if (look.main != null && copy.name === 'M_Main') copy.color.set(look.main).convertSRGBToLinear()
            if (look.joint != null && copy.name === 'M_Joints') copy.color.set(look.joint).convertSRGBToLinear()
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
