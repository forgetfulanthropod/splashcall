import * as THREE from 'three'
import { Accessory, WeaponSpec } from './spec'

export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
    const found = root.getObjectByName(name)
    return found == null ? null : found
}

export function accessoryBone(kind: Accessory): string {
    return kind === 'cape' ? 'spine_03' : 'Head'
}

export function makeWeapon(weapon: WeaponSpec): THREE.Group {
    const color = new THREE.Color(weapon.color).convertSRGBToLinear()
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.18 })
    const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a2e').convertSRGBToLinear(), roughness: 0.8 })
    const group = new THREE.Group()
    if (weapon.type === 'staff') {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.15, 8), grip)
        shaft.position.y = 0.45
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat)
        orb.position.y = 1.08
        group.add(shaft, orb)
    } else if (weapon.type === 'bow') {
        const limb = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 14, Math.PI), grip)
        limb.rotation.z = Math.PI
        limb.position.y = 0.5
        const string = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.66, 0.012), mat)
        string.position.y = 0.5
        group.add(limb, string)
    } else if (weapon.type === 'blaster') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.38), mat)
        body.position.set(0, 0.2, 0.1)
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), mat)
        barrel.rotation.x = Math.PI / 2
        barrel.position.set(0, 0.2, 0.36)
        group.add(body, barrel)
    } else {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.028), mat)
        blade.position.y = 0.5
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), grip)
        handle.position.y = 0.1
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.05), mat)
        guard.position.y = 0.22
        group.add(blade, handle, guard)
    }
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh !== true) return
        mesh.castShadow = true
        mesh.frustumCulled = false
    })
    group.name = 'weapon'
    return group
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
        const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), mat)
        cape.position.set(0, 0.05, -0.16)
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
        new THREE.PlaneGeometry(0.84, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x1b1b1b, depthTest: false })
    )
    const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(0.84, 0.1),
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
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).convertSRGBToLinear() })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), mat)
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
