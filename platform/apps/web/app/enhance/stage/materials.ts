import { MeshBasicMaterial, MeshLambertMaterial, ShadowMaterial } from "three";

/** One material per tone: theme.ts colours them from the tokens. */
export function buildMaterials() {
  const lambert = (options = {}) => new MeshLambertMaterial({ color: 0xffffff, ...options });
  const basic = (options = {}) => new MeshBasicMaterial({ color: 0xffffff, ...options });
  return {
    panel: lambert(),
    panelLocked: lambert({ transparent: true, opacity: 0.72 }),
    track: lambert(),
    node: lambert(),
    ring: lambert(),
    lock: lambert(),
    check: basic(),
    extra: lambert(),
    route: lambert(),
    glow: basic({ transparent: true, opacity: 0.08, depthWrite: false }),
    signal: lambert(),
    signalFlat: basic({ transparent: true, opacity: 0.5, depthWrite: false }),
    ink: lambert(),
    shadow: new ShadowMaterial({ opacity: 0.15 }),
    doneRing: basic({ transparent: true, opacity: 0, depthWrite: false }),
  };
}
export type Materials = ReturnType<typeof buildMaterials>;
