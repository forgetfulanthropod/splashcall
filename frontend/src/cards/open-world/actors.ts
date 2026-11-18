import * as THREE from 'three'
import { Accessory, WeaponSpec } from './spec'

export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
    const found = root.getObjectByName(name)
    return found == null ? null : found
}

export function accessoryBone(kind: Accessory): string {
    return kind === 'cape' ? 'spine_03' : 'Head'
}

function punchy(hex: string): THREE.Color {
    const color = new THREE.Color(hex)
    const lum = color.r * 0.299 + color.g * 0.587 + color.b * 0.114
    if (lum > 0.75) color.multiplyScalar(0.48)
    return color
}

function litMaterial(hex: string, metalness: number): THREE.MeshStandardMaterial {
    const color = punchy(hex).convertSRGBToLinear()
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.28),
        emissiveIntensity: 0.45,
        roughness: 0.4,
        metalness,
    })
}

/**
 * The shipped mannequin only has idle, walk, run, and jump.
 * Weapons are a small solid mesh parented to the hand, and the swing is procedural.
 */
export function makeWeapon(weapon: WeaponSpec): THREE.Group {
    const mat = litMaterial(weapon.color, 0.35)
    const grip = litMaterial('#6b4a2e', 0.05)
    const group = new THREE.Group()
    group.name = 'weapon'
    if (weapon.type === 'staff') {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 8), grip)
        shaft.rotation.x = Math.PI / 2
        shaft.position.z = 0.4
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat)
        orb.position.z = 0.86
        group.add(shaft, orb)
    } else if (weapon.type === 'bow') {
        const wood = litMaterial('#8a5a32', 0.08)
        const limb = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 18, Math.PI), wood)
        limb.position.set(0, -0.02, 0.05)
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), litMaterial('#f7f4ee', 0.05))
        string.position.set(0.02, -0.02, 0.05)
        const nock = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat)
        nock.position.set(0, 0.16, 0.05)
        group.add(limb, string, nock)
    } else if (weapon.type === 'blaster') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.26), mat)
        body.position.set(0, 0, 0.16)
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 8), mat)
        barrel.rotation.x = Math.PI / 2
        barrel.position.set(0, 0, 0.36)
        group.add(body, barrel)
    } else {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.5), mat)
        blade.position.z = 0.36
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.14, 6), grip)
        handle.rotation.x = Math.PI / 2
        handle.position.z = 0.06
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.04), mat)
        guard.position.z = 0.14
        group.add(blade, handle, guard)
    }
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        mesh.castShadow = false
        mesh.frustumCulled = false
    })
    return group
}

/**
 * The idle hand's local +Y points down the dangling arm, so a mesh built along +Y
 * ends up in the ground. Local +Z points forward. Tip the mesh so +Y becomes +Z.
 */
export function placeWeaponInHand(weapon: THREE.Group): void {
    weapon.position.set(0, 0.02, 0.04)
    weapon.rotation.set(0, 0, 0)
    weapon.scale.setScalar(1)
}

export function makeSlash(color: string): THREE.Mesh {
    const geo = new THREE.TorusGeometry(0.85, 0.035, 4, 14, Math.PI * 0.7)
    const mat = new THREE.MeshBasicMaterial({
        color: punchy(color).convertSRGBToLinear(),
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'slash'
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.position.set(0.15, 1.05, 0.35)
    mesh.rotation.x = Math.PI / 2.4
    return mesh
}

export function makeAccessory(kind: Accessory, tint: string): THREE.Group | null {
    if (kind === 'none') return null
    const base = tint === 'keep' ? '#e6b15a' : tint
    const color = new THREE.Color(base).convertSRGBToLinear()
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide })
    const group = new THREE.Group()
    group.name = 'accessory'
    if (kind === 'hat') {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.028, 12), mat)
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 10), mat)
        crown.position.y = 0.08
        group.position.y = 0.18
        group.add(brim, crown)
    } else if (kind === 'cape') {
        const cape = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 0.03), mat)
        cape.position.set(0, -0.02, -0.12)
        group.add(cape)
    } else if (kind === 'horns') {
        const hornMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4efe4').convertSRGBToLinear(), roughness: 0.4 })
        const left = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6), hornMat)
        left.position.set(-0.1, 0.16, 0.02)
        left.rotation.z = 0.45
        const right = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6), hornMat)
        right.position.set(0.1, 0.16, 0.02)
        right.rotation.z = -0.45
        group.add(left, right)
    } else {
        const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.16, 0.018, 6, 18),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color('#ffe27a').convertSRGBToLinear(),
                emissive: new THREE.Color('#ffc94a').convertSRGBToLinear(),
                emissiveIntensity: 0.55,
                roughness: 0.35,
            })
        )
        halo.rotation.x = Math.PI / 2
        halo.position.y = 0.3
        group.add(halo)
    }
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh === true) mesh.frustumCulled = false
    })
    return group
}

export function makeCreature(tint: string): THREE.Group {
    const color = new THREE.Color(tint).convertSRGBToLinear()
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.35 })
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), bodyMat)
    body.scale.y = 0.78
    body.position.y = 0.46
    body.castShadow = true
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat)
    eyeL.position.set(-0.14, 0.56, 0.32)
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat)
    eyeR.position.set(0.14, 0.56, 0.32)
    const group = new THREE.Group()
    group.add(body, eyeL, eyeR)
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh === true) mesh.frustumCulled = false
    })
    return group
}

export function makeHealthBar(): { group: THREE.Group, fill: THREE.Mesh } {
    const group = new THREE.Group()
    const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 0.14),
        new THREE.MeshBasicMaterial({ color: 0x1b1b1b, depthTest: false })
    )
    const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 0.14),
        new THREE.MeshBasicMaterial({ color: 0x3ddc6a, depthTest: false })
    )
    bg.renderOrder = 2
    fill.renderOrder = 3
    fill.position.z = 0.01
    group.add(bg, fill)
    group.visible = false
    return { group, fill }
}

export function makeBolt(color: string, radius: number): THREE.Mesh {
    const size = Math.max(0.16, radius)
    const geo = new THREE.ConeGeometry(size, size * 3.1, 7)
    geo.rotateX(Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ color: punchy(color).convertSRGBToLinear() })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    return mesh
}

export function setFlash(root: THREE.Object3D, amount: number): void {
    root.traverse((obj) => {
        if (ownedBy(obj, 'accessory') || ownedBy(obj, 'weapon')) return
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (let i = 0; i < list.length; i++) {
            const mat = list[i] as THREE.MeshStandardMaterial
            if (mat == null || mat.emissive == null) continue
            if (amount > 0) {
                mat.emissive.setHex(0xff4422)
                mat.emissiveIntensity = 0.65
            } else {
                mat.emissive.setHex(0x000000)
                mat.emissiveIntensity = 0
            }
        }
    })
}

function ownedBy(obj: THREE.Object3D, name: string): boolean {
    let current: THREE.Object3D | null = obj
    while (current != null) {
        if (current.name === name) return true
        current = current.parent
    }
    return false
}

export function standOnGround(object: THREE.Object3D, height: number): void {
    object.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object)
    const size = new THREE.Vector3()
    box.getSize(size)
    const fit = height / Math.max(0.001, size.y)
    object.scale.multiplyScalar(fit)
    object.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(object)
    object.position.y -= fitted.min.y
}

export function cloneProp(root: THREE.Object3D, name: string): THREE.Object3D | null {
    const node = root.getObjectByName(name)
    if (node == null) return null
    const copy = node.clone(true)
    copy.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        mesh.geometry = mesh.geometry.clone()
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = list.map((mat) => mat.clone())
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
        mesh.castShadow = true
        mesh.frustumCulled = false
    })
    return copy
}
