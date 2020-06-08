import {
  BufferGeometry,
  Mesh,
  BufferAttribute,
  ShaderLib,
  ShaderMaterial,
  UniformsUtils,
  VertexColors,
} from '../core/three.js';

// Voxels chunk

class Voxels extends Mesh {
  static setupMaterial() {
    Voxels.material = new ShaderMaterial({
      name: 'voxels-material',
      vertexColors: VertexColors,
      fog: true,
      fragmentShader: ShaderLib.basic.fragmentShader
        .replace(
          '#include <common>',
          [
            'varying float vlight;',
            'varying float vsunlight;',
            'uniform float sunlightIntensity;',
            '#include <common>',
          ].join('\n')
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          [
            'vec4 diffuseColor = vec4( diffuse * (vlight + max(vsunlight * sunlightIntensity, 0.05)) * 0.5, opacity );',
          ].join('\n')
        ),
      vertexShader: ShaderLib.basic.vertexShader
        .replace(
          '#include <common>',
          [
            'attribute float light;',
            'attribute float sunlight;',
            'varying float vlight;',
            'varying float vsunlight;',
            '#include <common>',
          ].join('\n')
        )
        .replace(
          '#include <begin_vertex>',
          [
            '#include <begin_vertex>',
            'vlight = light;',
            'vsunlight = sunlight;',
          ].join('\n')
        ),
      uniforms: {
        ...UniformsUtils.clone(ShaderLib.basic.uniforms),
        sunlightIntensity: { value: 1 },
      },
    });
    Voxels.transparentMaterial = Voxels.material.clone();
    Voxels.transparentMaterial.uniforms.opacity.value = 0.5;
    Voxels.transparentMaterial.transparent = true;
  }

  static updateMaterial(intensity) {
    if (!Voxels.material || !Voxels.transparentMaterial) {
      Voxels.setupMaterial();
    }
    Voxels.material.uniforms.sunlightIntensity.value = intensity;
    Voxels.transparentMaterial.uniforms.sunlightIntensity.value = intensity;
  }

  constructor() {
    if (!Voxels.material || !Voxels.transparentMaterial) {
      Voxels.setupMaterial();
    }
    super(
      new BufferGeometry(),
      Voxels.material
    );
    this.matrixAutoUpdate = false;
    this.transparentMesh = new Mesh(
      new BufferGeometry(),
      Voxels.transparentMaterial
    );
    this.transparentMesh.matrixAutoUpdate = false;
    this.add(this.transparentMesh);
  }

  dispose() {
    const { geometry } = this;
    geometry.dispose();
  }

  static decodeBase64(buffer, Type = Uint8Array, map = (v) => (v)) {
    buffer = atob(buffer);
    const len = buffer.length;
    const array = new Type(len);
    for (let i = 0; i < len; i += 1) {
      array[i] = map(buffer.charCodeAt(i));
    }
    return array;
  }

  update({
    chunk,
    heightmap,
    opaque,
    transparent,
  }) {
    const { decodeBase64, updateHeightmap } = Voxels;

    this.chunk = chunk;
    this.position
      .set(chunk.x, 0, chunk.z)
      .multiplyScalar(8);
    this.scale.set(0.5, 0.5, 0.5);
    this.updateMatrix();

    [opaque, transparent].forEach(({
      color,
      light,
      position,
    }, isTransparent) => {
      const mesh = isTransparent ? this.transparentMesh : this;
      if (!position.length) {
        mesh.visible = false;
        return;
      }

      const { geometry } = mesh;

      color = decodeBase64(color, Float32Array, (v) => (v / 0xFF));
      position = decodeBase64(position, Float32Array);
      light = decodeBase64(light);

      geometry.setAttribute('color', new BufferAttribute(color, 3));
      geometry.setAttribute('position', new BufferAttribute(position, 3));

      {
        const len = light.length;
        const lights = {
          light: new Float32Array(len),
          sun: new Float32Array(len),
        };
        for (let i = 0; i < len; i += 1) {
          const v = light[i];
          lights.light[i] = ((v >> 4) & 0xF) / 0xF;
          lights.sun[i] = (v & 0xF) / 0xF;
        }
        geometry.setAttribute('light', new BufferAttribute(lights.light, 1));
        geometry.setAttribute('sunlight', new BufferAttribute(lights.sun, 1));
      }

      {
        const len = (position.length / 3 / 4) * 6;
        const index = new Uint16Array(len);
        for (let i = 0, v = 0; i < len; i += 6, v += 4) {
          index[i] = v;
          index[i + 1] = v + 1;
          index[i + 2] = v + 2;
          index[i + 3] = v + 2;
          index[i + 4] = v + 3;
          index[i + 5] = v;
        }
        geometry.setIndex(new BufferAttribute(index, 1));
      }

      geometry.deleteAttribute('normal');
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      updateHeightmap({ geometry, heightmap });

      mesh.visible = true;
    });

    this.updateMatrixWorld();
  }

  static updateHeightmap({ geometry, heightmap }) {
    const aux = { x: 0, y: 0, z: 0 };
    const normal = geometry.getAttribute('normal');
    const position = geometry.getAttribute('position');
    const { count } = normal;
    for (let i = 0; i < count; i += 4) {
      if (
        normal.getX(i) === 0
        && normal.getY(i) === 1
        && normal.getZ(i) === 0
      ) {
        aux.x = 0xFF;
        aux.y = 0;
        aux.z = 0xFF;
        for (let j = 0; j < 4; j += 1) {
          aux.x = Math.min(aux.x, position.getX(i + j));
          aux.y = Math.max(aux.y, position.getY(i + j));
          aux.z = Math.min(aux.z, position.getZ(i + j));
        }
        const index = (aux.x * 16) + aux.z;
        heightmap[index] = Math.max(heightmap[index], aux.y);
      }
    }
  }
}

export default Voxels;
