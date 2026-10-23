import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const C = '/workspace/animwork/repo/apps/client/public/assets/characters';
for (const name of ['ammar', 'ammar-low']) {
  const doc = await io.read(`${C}/${name}.glb`);
  const root = doc.getRoot();
  for (const t of root.listTextures()) {
    if (!t.getName().endsWith('_nrm')) {
      t.setImage(new Uint8Array(readFileSync(`/tmp/skin_${name}_natural.webp`)));
    }
  }
  await io.write(`out/${name}-natural.glb`, doc);
  const joints = root.listSkins()[0].listJoints().map((j) => j.getName());
  console.log(name, 'natural skin written; joints:', joints.length, 'exts:', root.listExtensionsUsed().map((e) => e.extensionName));
}
