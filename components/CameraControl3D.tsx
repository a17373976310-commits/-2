
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface CameraControl3DProps {
    value: { azimuth: number; elevation: number; distance: number };
    onChange: (value: { azimuth: number; elevation: number; distance: number; prompt: string }) => void;
    imageUrl?: string;
}

export const CameraControl3D: React.FC<CameraControl3DProps> = ({ value, onChange, imageUrl }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const requestRef = useRef<number>();

    // State for internal tracking to avoid excessive re-renders
    const stateRef = useRef(value);

    // Mappings
    const AZIMUTH_MAP: Record<number, string> = {
        0: "front view",
        45: "front-right quarter view",
        90: "right side view",
        135: "back-right quarter view",
        180: "back view",
        225: "back-left quarter view",
        270: "left side view",
        315: "front-left quarter view"
    };

    const ELEVATION_MAP: Record<number, string> = {
        [-30]: "low-angle shot",
        0: "eye-level shot",
        30: "elevated shot",
        60: "high-angle shot"
    };

    const DISTANCE_MAP: Record<number, string> = {
        0.6: "close-up",
        1.0: "medium shot",
        1.4: "wide shot"
    };

    const snapToNearest = (val: number, options: number[]) => {
        return options.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
    };

    const buildPrompt = (az: number, el: number, dist: number) => {
        const azSnapped = snapToNearest(az, Object.keys(AZIMUTH_MAP).map(Number));
        const elSnapped = snapToNearest(el, Object.keys(ELEVATION_MAP).map(Number));
        const distSnapped = snapToNearest(dist, Object.keys(DISTANCE_MAP).map(Number));

        return `${AZIMUTH_MAP[azSnapped]} ${ELEVATION_MAP[elSnapped]} ${DISTANCE_MAP[distSnapped]}`;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a); // slate-900
        sceneRef.current = scene;

        const width = containerRef.current.clientWidth;
        const height = 450;
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.set(4.5, 3, 4.5);
        camera.lookAt(0, 0.75, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        // Grid
        const grid = new THREE.GridHelper(8, 16, 0x334155, 0x1e293b);
        scene.add(grid);

        // Constants
        const CENTER = new THREE.Vector3(0, 0.75, 0);
        const BASE_DISTANCE = 1.6;
        const AZIMUTH_RADIUS = 2.4;
        const ELEVATION_RADIUS = 1.8;

        // Camera Model (Visualization)
        const cameraGroup = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.5, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.38), bodyMat);
        cameraGroup.add(body);
        const lens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.11, 0.18, 16),
            new THREE.MeshStandardMaterial({ color: 0x4f46e5, metalness: 0.5, roughness: 0.3 })
        );
        lens.rotation.x = Math.PI / 2;
        lens.position.z = 0.26;
        cameraGroup.add(lens);
        scene.add(cameraGroup);

        // Azimuth Ring (Green)
        const azimuthRing = new THREE.Mesh(
            new THREE.TorusGeometry(AZIMUTH_RADIUS, 0.04, 16, 64),
            new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.3 })
        );
        azimuthRing.rotation.x = Math.PI / 2;
        azimuthRing.position.y = 0.05;
        scene.add(azimuthRing);

        const azimuthHandle = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.5 })
        );
        scene.add(azimuthHandle);

        // Elevation Arc (Pink)
        const arcPoints = [];
        for (let i = 0; i <= 32; i++) {
            const angle = THREE.MathUtils.degToRad(-30 + (90 * i / 32));
            arcPoints.push(new THREE.Vector3(-0.8, ELEVATION_RADIUS * Math.sin(angle) + CENTER.y, ELEVATION_RADIUS * Math.cos(angle)));
        }
        const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
        const elevationArc = new THREE.Mesh(
            new THREE.TubeGeometry(arcCurve, 32, 0.04, 8, false),
            new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 0.3 })
        );
        scene.add(elevationArc);

        const elevationHandle = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 0.5 })
        );
        scene.add(elevationHandle);

        // Distance Line & Handle (Orange)
        const distanceLineGeo = new THREE.BufferGeometry();
        const distanceLine = new THREE.Line(distanceLineGeo, new THREE.LineBasicMaterial({ color: 0xf59e0b }));
        scene.add(distanceLine);

        const distanceHandle = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.5 })
        );
        scene.add(distanceHandle);

        // Target Image Plane
        const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x334155, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        let targetPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), planeMaterial);
        targetPlane.position.copy(CENTER);
        scene.add(targetPlane);

        const updatePositions = () => {
            const { azimuth, elevation, distance: distFactor } = stateRef.current;
            const distance = BASE_DISTANCE * distFactor;
            const azRad = THREE.MathUtils.degToRad(azimuth);
            const elRad = THREE.MathUtils.degToRad(elevation);

            const camX = distance * Math.sin(azRad) * Math.cos(elRad);
            const camY = distance * Math.sin(elRad) + CENTER.y;
            const camZ = distance * Math.cos(azRad) * Math.cos(elRad);

            cameraGroup.position.set(camX, camY, camZ);
            cameraGroup.lookAt(CENTER);

            azimuthHandle.position.set(AZIMUTH_RADIUS * Math.sin(azRad), 0.05, AZIMUTH_RADIUS * Math.cos(azRad));
            elevationHandle.position.set(-0.8, ELEVATION_RADIUS * Math.sin(elRad) + CENTER.y, ELEVATION_RADIUS * Math.cos(elRad));

            const orangeDist = distance - 0.5;
            distanceHandle.position.set(
                orangeDist * Math.sin(azRad) * Math.cos(elRad),
                orangeDist * Math.sin(elRad) + CENTER.y,
                orangeDist * Math.cos(azRad) * Math.cos(elRad)
            );
            distanceLineGeo.setFromPoints([cameraGroup.position.clone(), CENTER.clone()]);
        };

        // Interaction
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let isDragging = false;
        let dragTarget: THREE.Object3D | null = null;
        let dragStartMouse = new THREE.Vector2();
        let dragStartDistance = 1.0;

        const onMouseDown = (e: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects([azimuthHandle, elevationHandle, distanceHandle]);

            if (intersects.length > 0) {
                isDragging = true;
                dragTarget = intersects[0].object;
                dragStartMouse.copy(mouse);
                dragStartDistance = stateRef.current.distance;
                containerRef.current!.style.cursor = 'grabbing';
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            if (isDragging && dragTarget) {
                raycaster.setFromCamera(mouse, camera);
                const intersection = new THREE.Vector3();

                if (dragTarget === azimuthHandle) {
                    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);
                    if (raycaster.ray.intersectPlane(plane, intersection)) {
                        let az = THREE.MathUtils.radToDeg(Math.atan2(intersection.x, intersection.z));
                        if (az < 0) az += 360;
                        stateRef.current.azimuth = az;
                    }
                } else if (dragTarget === elevationHandle) {
                    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.8);
                    if (raycaster.ray.intersectPlane(plane, intersection)) {
                        const relY = intersection.y - CENTER.y;
                        const relZ = intersection.z;
                        stateRef.current.elevation = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan2(relY, relZ)), -30, 60);
                    }
                } else if (dragTarget === distanceHandle) {
                    const deltaY = mouse.y - dragStartMouse.y;
                    stateRef.current.distance = THREE.MathUtils.clamp(dragStartDistance - deltaY * 1.5, 0.6, 1.4);
                }
                updatePositions();
            }
        };

        const onMouseUp = () => {
            if (isDragging) {
                const az = snapToNearest(stateRef.current.azimuth, Object.keys(AZIMUTH_MAP).map(Number));
                const el = snapToNearest(stateRef.current.elevation, Object.keys(ELEVATION_MAP).map(Number));
                const dist = snapToNearest(stateRef.current.distance, Object.keys(DISTANCE_MAP).map(Number));

                stateRef.current = { azimuth: az, elevation: el, distance: dist };
                updatePositions();
                onChange({ ...stateRef.current, prompt: buildPrompt(az, el, dist) });
            }
            isDragging = false;
            dragTarget = null;
            containerRef.current!.style.cursor = 'default';
        };

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const animate = () => {
            requestRef.current = requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();
        updatePositions();

        return () => {
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            renderer.dispose();
        };
    }, []);

    return (
        <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 shadow-inner">
            <div ref={containerRef} className="w-full h-[450px]" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border border-emerald-500/30 font-mono text-[10px] text-emerald-400 whitespace-nowrap z-10 shadow-2xl">
                {buildPrompt(value.azimuth, value.elevation, value.distance)}
            </div>
            <div className="absolute top-4 right-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[9px] text-white/60 uppercase font-bold">Azimuth</span>
                </div>
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-pink-500" />
                    <span className="text-[9px] text-white/60 uppercase font-bold">Elevation</span>
                </div>
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[9px] text-white/60 uppercase font-bold">Distance</span>
                </div>
            </div>
        </div>
    );
};
