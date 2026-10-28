import React from 'react'
import * as THREE from 'three'
import { bindTouch, SceneApi } from '../textureUtils'
import { useScene } from '../hooks'

export default function BouncyBalls(): JSX.Element {
    const [onRef] = useScene(createScene)

    return <canvas ref={onRef} style={{ width: '100%' }} />
}

function createScene(canvas: HTMLCanvasElement, { width: WIDTH, height: HEIGHT }): SceneApi {
    canvas.width = WIDTH
    canvas.height = HEIGHT

    const VELOCITY_DAMPING = 0.95 // 0 is total damping, 1 is no damping
    const POSITIONAL_DAMPING = 0.98 // 0 is total damping, 1 is no damping
    const POPIGATION_RATIO = .1 // 1 flows directly, 0 goes nowhere
    const SPRING_CONSTANT = .1 // controls speed .01 - .1 reasonable range
    const TOUCH_INTENSITY = 1.5 // .1 - 5 reasonable range
    const DRAG_INTENSITY = .3
    const OTHER_TOUCH_INTENSITY = .3
    const ZOOM = 15

    let ballDiameter,
        numBallsPerRow,
        numBallRows,
        ballZPlane

    let renderer, meshes, scene, resTracker, interval, touchIt


    assignBallInfo(.8)

    function assignBallInfo(d) {
        ballDiameter = d
        numBallsPerRow = 14
        console.log({ numBallsPerRow })
        numBallRows = Math.floor(numBallsPerRow * HEIGHT / WIDTH)
        ballZPlane = ZOOM

    }

    start()

    function start() {
        // Set up tracker for memory management
        // copied from here: https://threejsfundamentals.org/threejs/lessons/threejs-cleanup.html
        class ResourceTracker {
            resources: (THREE.Object3D | { dispose: () => void })[]
            constructor() {
                this.resources = []
            }
            track(resource) {
                if (resource.dispose != null || resource instanceof THREE.Object3D) {
                    this.resources.push(resource)
                }
                return resource
            }
            dispose() {
                for (const resource of this.resources) {
                    if (resource instanceof THREE.Object3D) {
                        if (resource.parent != null) {
                            resource.parent.remove(resource)
                        }
                    }
                    if (resource.dispose != null) {
                        resource.dispose()
                    }
                }
                this.resources = []
            }
        }
        resTracker = new ResourceTracker()
        const track = resTracker.track.bind(resTracker)

        // intialize scene and camera
        scene = new THREE.Scene()
        const camera = track(new THREE.PerspectiveCamera(75, WIDTH / HEIGHT, 0.1, 1000))
        camera.position.z = 0
        camera.rotation.y = -Math.PI

        // intialize renderer and attach to a new dom element
        renderer = track(new THREE.WebGLRenderer({ antialias: true, canvas }))

        renderer.setClearColor('#666666') // TODO is this the background we want?
        // TODO adjust to the right size also figure out how to attach to canvas.
        // renderer.setSize(WIDTH, HEIGHT)
        //document.body.appendChild(renderer.domElement)

        // if (!IS_FULL_SCREEN) renderer.domElement.style.borderRadius = '12px'
        // canvas.appendChild(renderer.domElement)


        // Same color scheme as flatwaves
        const colors = ['#ffcd70', '#f5424b', '#ff9e9e', '#adfcff', '#ebadff', '#7df59f', '#def491',
            '#9eaaba', '#9ee7ff']

        // parallel lists for balls, and some globals
        meshes = []
        const springs = [] // Z displacement of each ball
        const dSprings = [] // velocity (delta) for each ball
        const neighbors = [] // index of adjacent balls


        // This converts 2d coords to flat list coords.
        function ij2n(i, j) {
            return j + i * numBallRows
        }

        let seed = 1
        function myRandom() {
            const x = Math.sin(seed++) * 10000
            return x - Math.floor(x)
        }

        // Iterates over all the balls and build up our list of meshes.
        for (let i = 0; i < numBallsPerRow; i++) {
            for (let j = 0; j < numBallRows; j++) {
                const geometry = track(new THREE.SphereGeometry(ballDiameter, 15, 15))
                const color = colors[Math.floor(myRandom() * colors.length)]
                const material = track(new THREE.MeshPhongMaterial({ color: color }))
                const sphere = track(new THREE.Mesh(geometry, material))
                scene.add(sphere)

                // gets neighbor below and to the right
                const newNeighbor = []
                for (const [di, dj] of [[0, 1], [1, 0]]) {
                    if (i + di > 0 && i + di < numBallsPerRow && j + dj > 0 && j + dj < numBallRows) {
                        newNeighbor.push(ij2n(i + di, j + dj))
                    }
                }
                neighbors.push(newNeighbor)

                sphere.position.set((i - numBallsPerRow / 2) * 2 + 1, (j - numBallRows / 2) * 2, numBallRows)
                meshes.push(sphere)
                springs.push(0)
                dSprings.push(0)
            }
        }

        // Create raycaster for getting x and y of mouse click.
        let canvasTo3d
        {
            const raycaster = track(new THREE.Raycaster())
            const mouse = track(new THREE.Vector2())
            const geometry = track(new THREE.BoxGeometry(100, 100, 1))
            const material = track(new THREE.MeshBasicMaterial({ color: '#ff00ff' }))
            material.transparent = true
            const ground = track(new THREE.Mesh(geometry, material))
            ground.visible = false
            ground.position.set(0, 0, ballZPlane)
            scene.add(ground)
            ground.rotation.z = THREE.Math.degToRad(-5)
            canvasTo3d = function (x, y) {
                ground.visible = true
                mouse.x = x / WIDTH * 2 - 1
                mouse.y = -y / HEIGHT * 2 + 1
                raycaster.setFromCamera(mouse, camera)
                const intersects = raycaster.intersectObject(ground)
                ground.visible = false
                if (intersects?.[0]?.point != null) {
                    return [intersects[0].point.x, intersects[0].point.y]
                }
                console.error('Failed raytrace')
                return [0, 0] // this should never get called
            }

        }

        // touches the spheres, propelling them backward.
        // Pass in a mult of 1 or less to have a smaller impact.
        touchIt = function (canvasX, canvasY, mult) {
            const [x, y] = canvasTo3d(canvasX, canvasY)
            for (let i = 0; i < meshes.length; i++) {
                const mesh = meshes[i]
                // TODO optimize distance function, maybe use a 3js builtin?
                const [a, b] = [mesh.position.x, mesh.position.y]
                const distance = Math.sqrt((x - a) ** 2 + (y - b) ** 2)
                const intensity = Math.max(0, 5 - distance)
                dSprings[i] += intensity * mult
            }
        }

        bindTouch({
            el: renderer.domElement,
            touchCallback: (touches) => {
                touches.forEach(touch => {
                    touchIt(touch.x, touch.y, TOUCH_INTENSITY)
                })
                touchCallback(touches)

            },
            dragCallback: (touches) => {
                touches.forEach(t => touchIt(t.x, t.y, DRAG_INTENSITY))
                touchCallback(touches)
            },
            touchEndCallback: () => {
                touchCallback([{ x: -1, y: -1 }])
            },
        })

        // Add ambient and point light.
        // TODO they look pretty flat, we might be able to improve performance
        // by switching to a basic material and removing the point light.
        let light
        {
            const color = 0xFFFFFF
            light = track(new THREE.PointLight(color, 0.2))
            light.position.set(0, 0, 3)
            scene.add(light)
            const light2 = track(new THREE.AmbientLight(color, 1.1))
            scene.add(light2)

        }

        // Render also does physics updates, which might be an issue
        // for varying framerates and such. A proper game loop might be
        // needed if we have issues.
        function render() {

            //TODO: color based on height

            for (let i = 0; i < meshes.length; i++) {
                for (const neigh of neighbors[i]) {
                    const pull = POPIGATION_RATIO * (springs[i] - springs[neigh])
                    dSprings[i] -= pull
                    dSprings[neigh] += pull
                }

                springs[i] += 0.1 * dSprings[i]
                dSprings[i] -= SPRING_CONSTANT * springs[i]
                dSprings[i] *= VELOCITY_DAMPING
                springs[i] *= POSITIONAL_DAMPING
                meshes[i].position.z = ballZPlane + springs[i]
            }
            renderer.render(scene, camera)
        }

        interval = setInterval(render, 1000 / 30)

    }

    function stopTime() {
        clearInterval(interval)

        renderer.setAnimationLoop(null)
        renderer.renderLists.dispose()
        resTracker.dispose()
        scene = null
        renderer = null
        meshes = null

    }

    function setOtherTouches(ots) {
        ots.forEach(t => touchIt(t.x, t.y, OTHER_TOUCH_INTENSITY))
    }

    let touchCallback = (_) => _
    function onTouches(callback) {
        touchCallback = callback
    }

    function setSettings(settings) {
        if (settings.drawer.ballDiameter != null) {
            stopTime()
            assignBallInfo(settings.drawer.ballDiameter.value)
            start()
        }
    }

    return { stopTime, setOtherTouches, onTouches, setSettings }
}
