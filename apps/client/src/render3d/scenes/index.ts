// Scene registry: each scene is its own lazily-loaded chunk (its code; its procedural textures are only made when
// it mounts). The shared garden base (court, badminton, tea service, greenery) is one chunk, loaded once.
import { lazy, type ComponentType } from 'react';
import type { SceneName } from '../../prefs';
import type { SceneProps } from './base';

type Mod = { default: ComponentType<SceneProps> };
const loaders: Record<SceneName, () => Promise<Mod>> = {
  golden: () => import('./golden'),
  picnic: () => import('./picnic'),
  dusk: () => import('./dusk'),
  classic: () => import('./classic'),
};
const started = new Map<SceneName, Promise<Mod>>();
/** start (once) downloading a scene's chunk; resolves when it is ready to mount */
export function preloadScene(s: SceneName): Promise<Mod> { let p = started.get(s); if (!p) { p = loaders[s](); started.set(s, p); } return p; }
export const SCENE_VIEWS: Record<SceneName, ComponentType<SceneProps>> = {
  golden: lazy(() => preloadScene('golden')),
  picnic: lazy(() => preloadScene('picnic')),
  dusk: lazy(() => preloadScene('dusk')),
  classic: lazy(() => preloadScene('classic')),
};
