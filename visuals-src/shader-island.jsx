// The only React island in Buzzer: a decorative background, never the game state.
import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

class ShaderBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
const roots = new Map();
export function mount(element, { role = 'menu', intensity = 'light', onFailure = () => {} } = {}) {
  unmount(element);
  const root = createRoot(element);
  roots.set(element, root);
  const isMenu = role === 'menu', isPlayer = role === 'player';
  const density = intensity === 'full' ? 1 : .65;
  root.render(<ShaderBoundary onFailure={onFailure}><ShaderGradientCanvas
    style={{ position: 'absolute', inset: 0 }}
    pixelDensity={Math.min(density, window.devicePixelRatio || 1)}
    fov={45} pointerEvents="none" lazyLoad={false}
    preserveDrawingBuffer={true} powerPreference="low-power"
  ><ShaderGradient
    control="props" type="plane" animate="on" grain="off" lightType="3d"
    color1={isMenu ? '#172715' : '#192319'} color2="#728744" color3="#d7ed74"
    brightness={.75} cDistance={4.4} cPolarAngle={90} cAzimuthAngle={180}
    rotationX={0} rotationY={0} rotationZ={-25}
    uSpeed={isMenu ? .06 : isPlayer ? .035 : .025}
    uStrength={isMenu ? 1.1 : .45} uDensity={1.4} uFrequency={3.2} uAmplitude={.8}
    reflection={0} wireframe={false} enableTransition={false} enableCameraUpdate={false}
  /></ShaderGradientCanvas></ShaderBoundary>);
}
export function unmount(element) {
  const root = roots.get(element);
  if (root) { root.unmount(); roots.delete(element); }
}
