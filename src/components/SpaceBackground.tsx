"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

// DNA Helix - represents genetic lineage tracking
function DNAHelix() {
  const groupRef = useRef<THREE.Group>(null);
  
  const helixData = useMemo(() => {
    const points1: THREE.Vector3[] = [];
    const points2: THREE.Vector3[] = [];
    const connectors: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    
    const turns = 3;
    const height = 40;
    const radius = 3;
    const segments = 100;
    
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * turns;
      const y = (t - 0.5) * height;
      
      points1.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
      ));
      
      points2.push(new THREE.Vector3(
        Math.cos(angle + Math.PI) * radius,
        y,
        Math.sin(angle + Math.PI) * radius
      ));
      
      if (i % 10 === 0) {
        connectors.push({
          start: points1[i].clone(),
          end: points2[i].clone()
        });
      }
    }
    
    return { points1, points2, connectors };
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[-20, 0, -15]}>
      {/* Helix strand 1 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={helixData.points1.length}
            array={new Float32Array(helixData.points1.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.4} />
      </line>
      
      {/* Helix strand 2 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={helixData.points2.length}
            array={new Float32Array(helixData.points2.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#a78bfa" transparent opacity={0.4} />
      </line>
      
      {/* Base pair connectors */}
      {helixData.connectors.map((conn, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                conn.start.x, conn.start.y, conn.start.z,
                conn.end.x, conn.end.y, conn.end.z
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#e879f9" transparent opacity={0.3} />
        </line>
      ))}
    </group>
  );
}

// Data particles flowing - represents real-time data/analytics
function DataParticles() {
  const ref = useRef<THREE.Points>(null);
  
  const [positions, velocities] = useMemo(() => {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Start from bottom, flow upward
      positions[i3] = (Math.random() - 0.5) * 60;
      positions[i3 + 1] = (Math.random() - 0.5) * 80;
      positions[i3 + 2] = (Math.random() - 0.5) * 40 - 20;
      
      velocities[i3] = (Math.random() - 0.5) * 0.02;
      velocities[i3 + 1] = Math.random() * 0.05 + 0.02; // Upward flow
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    
    return [positions, velocities];
  }, []);

  useFrame(() => {
    if (ref.current) {
      const pos = ref.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += velocities[i];
        pos[i + 1] += velocities[i + 1];
        pos[i + 2] += velocities[i + 2];
        
        // Reset particles that go too high
        if (pos[i + 1] > 40) {
          pos[i + 1] = -40;
          pos[i] = (Math.random() - 0.5) * 60;
          pos[i + 2] = (Math.random() - 0.5) * 40 - 20;
        }
      }
      
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#22d3ee"
        size={0.5}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.6}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// Molecular structure - represents contamination analysis
function MolecularStructure() {
  const groupRef = useRef<THREE.Group>(null);
  
  const nodes = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      position: [
        Math.sin(i * 0.5) * 8 + (Math.random() - 0.5) * 4,
        Math.cos(i * 0.7) * 6 + (Math.random() - 0.5) * 4,
        Math.sin(i * 0.3) * 5 - 10,
      ] as [number, number, number],
      scale: 0.3 + Math.random() * 0.3,
      color: ["#22d3ee", "#a78bfa", "#e879f9", "#10b981"][i % 4],
    }));
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.3;
      groupRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.15) * 0.2;
    }
  });

  return (
    <group ref={groupRef} position={[18, 5, -10]}>
      {nodes.map((node, i) => (
        <mesh key={i} position={node.position}>
          <sphereGeometry args={[node.scale, 12, 12]} />
          <meshBasicMaterial
            color={node.color}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      
      {/* Bonds between nodes */}
      {nodes.slice(0, -1).map((node, i) => {
        const next = nodes[i + 1];
        return (
          <line key={`bond-${i}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  ...node.position,
                  ...next.position
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.15} />
          </line>
        );
      })}
    </group>
  );
}

// Scientific grid with data visualization feel
function ScienceGrid() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current && ref.current.material instanceof THREE.ShaderMaterial) {
      ref.current.material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        
        void main() {
          // Main grid
          vec2 grid = abs(fract(vUv * 30.0 - 0.5) - 0.5) / fwidth(vUv * 30.0);
          float line = min(grid.x, grid.y);
          float gridAlpha = 1.0 - min(line, 1.0);
          
          // Secondary finer grid
          vec2 grid2 = abs(fract(vUv * 60.0 - 0.5) - 0.5) / fwidth(vUv * 60.0);
          float line2 = min(grid2.x, grid2.y);
          float gridAlpha2 = 1.0 - min(line2, 1.0);
          
          // Scanning line effect
          float scanLine = smoothstep(0.0, 0.02, abs(fract(vUv.y - uTime * 0.1) - 0.5));
          
          // Color gradient based on position
          vec3 color1 = vec3(0.133, 0.827, 0.933); // cyan
          vec3 color2 = vec3(0.655, 0.545, 0.980); // violet
          vec3 color = mix(color1, color2, vUv.x + sin(uTime * 0.5) * 0.2);
          
          // Edge fade
          float fade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
          fade *= smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          
          float alpha = (gridAlpha * 0.06 + gridAlpha2 * 0.02) * fade;
          alpha += (1.0 - scanLine) * 0.03 * fade;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }, []);

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -20, 0]} material={shaderMaterial}>
      <planeGeometry args={[200, 200, 1, 1]} />
    </mesh>
  );
}

// Floating data points representing metrics
function MetricOrbs() {
  const groupRef = useRef<THREE.Group>(null);
  
  const orbs = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20 - 15,
      ] as [number, number, number],
      scale: 1 + Math.random() * 2,
      speed: 0.2 + Math.random() * 0.3,
      color: ["#10b981", "#22d3ee", "#a78bfa"][i % 3], // green for success, cyan for data, violet for AI
    }));
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const orb = orbs[i];
        child.position.y += Math.sin(state.clock.elapsedTime * orb.speed + i * 2) * 0.008;
        child.position.x += Math.cos(state.clock.elapsedTime * orb.speed * 0.5 + i) * 0.004;
        
        // Pulse effect
        const scale = orb.scale * (1 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.1);
        child.scale.setScalar(scale);
      });
    }
  });

  return (
    <group ref={groupRef}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial
            color={orb.color}
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function SpaceBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 35], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true }}
      >
        <color attach="background" args={["#030508"]} />
        <fog attach="fog" args={["#030508", 40, 120]} />
        <ambientLight intensity={0.3} />
        
        {/* Science-themed elements */}
        <DNAHelix />
        <DataParticles />
        <MolecularStructure />
        <ScienceGrid />
        <MetricOrbs />
      </Canvas>
    </div>
  );
}
