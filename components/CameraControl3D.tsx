
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal } from 'react-dom';

interface CameraControl3DProps {
    value: { azimuth: number; elevation: number; distance: number };
    onChange: (value: { azimuth: number; elevation: number; distance: number; prompt: string }) => void;
    imageUrl?: string;
}

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

const ThreeScene: React.FC<{
    value: { azimuth: number; elevation: number; distance: number };
    onChange: (val: any) => void;
    imageUrl?: string;
}> = ({ value, onChange, imageUrl }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef(value);
    const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const updatePositionsRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        stateRef.current = value;
        if (updatePositionsRef.current) updatePositionsRef.current();
    }, [value]);

    useEffect(() => {
        if (materialRef.current) {
            const loader = new THREE.TextureLoader();
            if (imageUrl) {
                loader.load(imageUrl, (texture) => {
                    if (materialRef.current) {
                        materialRef.current.map = texture;
                        materialRef.current.color.set(0xffffff);
                        materialRef.current.opacity = 1;
                        materialRef.current.needsUpdate = true;
                    }
                });
            } else {
                materialRef.current.map = null;
                materialRef.current.color.set(0x334155);
                materialRef.current.opacity = 0.5;
                materialRef.current.needsUpdate = true;
            }
        }
    }, [imageUrl]);

    useEffect(() => {
        if (!containerRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a);

        // Initial size capture
        const rect = containerRef.current.getBoundingClientRect();
        const width = rect.width || 800;
        const height = rect.height || 450;

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.set(4.5, 3, 4.5);
        camera.lookAt(0, 0.75, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height, false); // Don't update style, use CSS

        // Ensure canvas fills container and is centered
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.top = '0';
        renderer.domElement.style.left = '0';

        containerRef.current.innerHTML = ''; // Clear any existing canvas
        containerRef.current.appendChild(renderer.domElement);

        // Resize Handling
        const handleResize = () => {
            if (!containerRef.current) return;
            const r = containerRef.current.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;

            renderer.setSize(r.width, r.height, false);
            camera.aspect = r.width / r.height;
            camera.updateProjectionMatrix();
        };

        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(containerRef.current);

        // Multiple checks to ensure size is correct during modal animations
        const timer1 = setTimeout(handleResize, 50);
        const timer2 = setTimeout(handleResize, 300);

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        const grid = new THREE.GridHelper(8, 16, 0x334155, 0x1e293b);
        scene.add(grid);

        const CENTER = new THREE.Vector3(0, 0.75, 0);
        const BASE_DISTANCE = 1.6;
        const AZIMUTH_RADIUS = 2.4;
        const ELEVATION_RADIUS = 1.8;

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

        const azimuthRing = new THREE.Mesh(
            new THREE.TorusGeometry(AZIMUTH_RADIUS, 0.04, 16, 64),
            new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.3 })
        );
        azimuthRing.rotation.x = Math.PI / 2;
        azimuthRing.position.y = 0.05;
        scene.add(azimuthRing);

        const azimuthHandle = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.5 })
        );
        scene.add(azimuthHandle);

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
            new THREE.SphereGeometry(0.28, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 0.5 })
        );
        scene.add(elevationHandle);

        const distanceLineGeo = new THREE.BufferGeometry();
        const distanceLine = new THREE.Line(distanceLineGeo, new THREE.LineBasicMaterial({ color: 0xf59e0b }));
        scene.add(distanceLine);

        const distanceHandle = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.5 })
        );
        scene.add(distanceHandle);

        // Target Image Plane
        const loader = new THREE.TextureLoader();
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: imageUrl ? 0xffffff : 0x334155,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: imageUrl ? 1 : 0.5,
            map: imageUrl ? loader.load(imageUrl) : null
        });
        materialRef.current = planeMaterial;
        const targetPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), planeMaterial);
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

        updatePositionsRef.current = updatePositions;


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

                const newState = { azimuth: az, elevation: el, distance: dist };
                stateRef.current = newState;
                updatePositions();
                onChange({ ...newState, prompt: buildPrompt(az, el, dist) });
            }
            isDragging = false;
            dragTarget = null;
            if (containerRef.current) containerRef.current.style.cursor = 'default';
        };

        renderer.domElement.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();
        updatePositions();

        return () => {
            resizeObserver.disconnect();
            clearTimeout(timer1);
            clearTimeout(timer2);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            renderer.dispose();
        };
    }, []);

    return <div ref={containerRef} className="flex-1 w-full h-full min-h-[400px] relative overflow-hidden" onMouseDown={e => e.stopPropagation()} />;
};

export const CameraControl3D: React.FC<CameraControl3DProps> = ({ value, onChange, imageUrl }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const renderUI = (isModal: boolean) => (
        <div className={`relative flex flex-col w-full ${isModal ? 'flex-1 h-full' : 'h-[450px]'}`}>
            <ThreeScene value={value} onChange={onChange} imageUrl={imageUrl} />

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

            {!isModal && (
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="absolute top-4 left-4 bg-blue-600/80 hover:bg-blue-500 text-white p-2 rounded-lg backdrop-blur-md border border-white/10 transition-all flex items-center gap-2 shadow-xl"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">全屏编辑</span>
                </button>
            )}
        </div>
    );

    return (
        <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 shadow-inner">
            {renderUI(false)}

            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300 p-4 md:p-12">
                    <div className="relative bg-slate-900 rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden w-full max-w-6xl h-[85vh] flex flex-col">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-800/50">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></div>
                                <span className="font-black text-xs text-white uppercase tracking-widest">3D 视角高级编辑器</span>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="flex-1 relative overflow-hidden">
                            {renderUI(true)}
                        </div>
                        <div className="p-6 bg-slate-800/30 border-t border-white/5 flex justify-center">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all hover:scale-105 active:scale-95"
                            >
                                完成编辑
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
