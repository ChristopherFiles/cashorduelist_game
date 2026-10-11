// ============ Generator data dunia (deterministik, prosedural) ============
import type { WorldData, RoadSegment, BuildingSpec, CustomerSpec, PackageSpec, BuildingKind, AABB } from './types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMER_NAMES = [
  'Bu Sari', 'Pak Budi', 'Toko Amanah', 'Kantor Sejahtera', 'Bu Wati',
  'Pak Joko', 'Warung Barokah', 'CV Nusantara', 'Bu Rina', 'Pak Hendra',
  'Toko Makmur', 'Klinic Sentosa', 'Bu Dewi', 'Pak Rudi', 'Laundry Bersih',
  'Bakery Loka', 'Pak Tono', 'Toko Sembako 88',
];

const STREET_NAMES_H = ['Jl. Merdeka', 'Jl. Diponegoro', 'Jl. Sudirman', 'Jl. Kartini'];

const PKG_NAMES = [
  'Kardus Elektronik', 'Kardus Pakaian', 'Pak Dokumen', 'Kardus Makanan',
  'Tas Kain', 'Box Perlengkapan', 'Kardus Obat', 'Pak Kertas',
  'Kardus Mainan', 'Box Aksesoris', 'Kardus Buku', 'Pak Peralatan',
];

function pickBuildingColor(r: number): string {
  const palette = ['#b8b0a4', '#a8b4bc', '#c4b39a', '#9aa7a0', '#b7a8c4', '#c9c2b4', '#8f9aa3', '#d4cbb8'];
  return palette[Math.floor(r * palette.length) % palette.length];
}

function pickKind(r: number, h: number): BuildingKind {
  if (h > 15) return 'office';
  if (r < 0.35) return 'shop';
  if (r < 0.8) return 'house';
  return 'office';
}

export function buildWorldData(): WorldData {
  const rng = mulberry32(20261010);
  const VX = [-160, -80, 0, 80, 160];
  const VZ = [-120, -40, 40, 120];

  // ---------- Jalan ----------
  const roads: RoadSegment[] = [];
  const isMainX = (i: number) => VX[i] === -80;
  const isMainZ = (j: number) => VZ[j] === 40;
  for (let i = 0; i < VX.length; i++) {
    for (let j = 0; j + 1 < VZ.length; j++) {
      roads.push({ x1: VX[i], z1: VZ[j], x2: VX[i], z2: VZ[j + 1], width: isMainX(i) ? 16 : 10, type: isMainX(i) ? 'main' : 'street' });
    }
  }
  for (let j = 0; j < VZ.length; j++) {
    for (let i = 0; i + 1 < VX.length; i++) {
      roads.push({ x1: VX[i], z1: VZ[j], x2: VX[i + 1], z2: VZ[j], width: isMainZ(j) ? 16 : 10, type: isMainZ(j) ? 'main' : 'street' });
    }
  }

  // ---------- Bangunan per blok (blok 0,0 = DC) ----------
  const buildings: BuildingSpec[] = [];
  const blockMargin = 12;
  for (let i = 0; i + 1 < VX.length; i++) {
    for (let j = 0; j + 1 < VZ.length; j++) {
      if (i === 0 && j === 0) continue; // area DC
      const x0 = VX[i] + blockMargin, x1 = VX[i + 1] - blockMargin;
      const z0 = VZ[j] + blockMargin, z1 = VZ[j + 1] - blockMargin;
      const n = 2 + Math.floor(rng() * 3);
      const placed: AABB[] = [];
      for (let k = 0; k < n; k++) {
        const w = 11 + rng() * 13;
        const d = 9 + rng() * 10;
        const h = 6 + rng() * 15;
        let px = -1, pz = -1;
        for (let tries = 0; tries < 30; tries++) {
          const cx = x0 + rng() * Math.max(0.01, x1 - x0 - w);
          const cz = z0 + rng() * Math.max(0.01, z1 - z0 - d);
          const box: AABB = { x1: cx, z1: cz, x2: cx + w, z2: cz + d };
          const clear = placed.every(p =>
            box.x2 + 6 < p.x1 || box.x1 - 6 > p.x2 || box.z2 + 6 < p.z1 || box.z1 - 6 > p.z2);
          if (clear) { px = cx; pz = cz; break; }
        }
        if (px < 0) continue;
        placed.push({ x1: px, z1: pz, x2: px + w, z2: pz + d });
        buildings.push({
          x: px + w / 2, z: pz + d / 2, w, d, h,
          color: pickBuildingColor(rng()),
          kind: pickKind(rng(), h),
        });
      }
    }
  }

  // ---------- Pelanggan ----------
  const customers: CustomerSpec[] = [];
  const custBlocks: [number, number, number][] = [
    [1, 0, 1], [2, 0, 1], [3, 0, 1],
    [1, 1, 1], [2, 1, 2], [3, 1, 1],
    [1, 2, 1], [2, 2, 1], [3, 2, 1],
    [0, 1, 1], [0, 2, 1], [2, 1, 1],
  ];
  let cIdx = 0;
  for (const [bi, bj] of custBlocks) {
    const count = custBlocks.filter(b => b[0] === bi && b[1] === bj).length;
    const x0 = VX[bi], x1 = VX[bi + 1], z0 = VZ[bj], z1 = VZ[bj + 1];
    const side = rng() < 0.5 ? 0 : 1; // 0 = selatan, 1 = utara
    for (let k = 0; k < count; k++) {
      const hw = (side === 0 ? (isMainZ(bj + 1) ? 8 : 5) : (isMainZ(bj) ? 8 : 5));
      const x = x0 + 10 + rng() * Math.max(1, x1 - x0 - 20);
      const z = side === 0 ? z1 - hw - 5 : z0 + hw + 5;
      const streetName = (side === 0 ? STREET_NAMES_H[bj + 1] : STREET_NAMES_H[bj]) ?? 'Jl. Kota';
      const pkgCount = 1 + Math.floor(rng() * 3);
      const packages: PackageSpec[] = [];
      for (let p = 0; p < pkgCount; p++) {
        const size = (rng() < 0.4 ? 'S' : rng() < 0.75 ? 'M' : 'L') as 'S' | 'M' | 'L';
        const weight = size === 'S' ? 2 + rng() * 5 : size === 'M' ? 7 + rng() * 8 : 15 + rng() * 20;
        const name = PKG_NAMES[Math.floor(rng() * PKG_NAMES.length)];
        packages.push({
          id: `PKG-${String(cIdx + 1).padStart(2, '0')}-${p + 1}`,
          customerId: `C-${String(cIdx + 1).padStart(2, '0')}`,
          name,
          weight: Math.round(weight * 10) / 10,
          size,
          payment: 0,
          fragile: name.includes('Dokumen') || name.includes('Obat') || name.includes('Aksesoris'),
        });
      }
      const payment = Math.round((45000 + rng() * 55000) / 5000) * 5000;
      const perPkg = Math.round(payment / pkgCount / 1000) * 1000;
      packages.forEach(p => (p.payment = perPkg));
      customers.push({
        id: `C-${String(cIdx + 1).padStart(2, '0')}`,
        name: CUSTOMER_NAMES[cIdx % CUSTOMER_NAMES.length],
        address: `${streetName} No. ${10 + Math.floor(rng() * 90)}`,
        x, z,
        packages,
        payment,
      });
      cIdx++;
    }
  }

  // ---------- Pohon, lampu jalan, mobil parkir ----------
  const trees: { x: number; z: number; s: number }[] = [];
  for (let t = 0; t < 90; t++) {
    const bi = Math.floor(rng() * 4), bj = Math.floor(rng() * 3);
    if (bi === 0 && bj === 0) continue;
    const x = VX[bi] + 6 + rng() * (VX[bi + 1] - VX[bi] - 12);
    const z = VZ[bj] + 6 + rng() * (VZ[bj + 1] - VZ[bj] - 12);
    const insideBuilding = buildings.some(b =>
      x > b.x - b.w / 2 - 2 && x < b.x + b.w / 2 + 2 && z > b.z - b.d / 2 - 2 && z < b.z + b.d / 2 + 2);
    if (insideBuilding) continue;
    trees.push({ x, z, s: 0.8 + rng() * 0.7 });
  }

  const lamps: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i < VX.length; i++) {
    if (!isMainX(i)) continue;
    for (let j = 0; j + 1 < VZ.length; j++) {
      const len = VZ[j + 1] - VZ[j];
      const nLamp = Math.floor(len / 40);
      for (let k = 0; k < nLamp; k++) {
        const z = VZ[j] + (len / (nLamp + 1)) * (k + 1);
        const side = k % 2 === 0 ? 1 : -1;
        lamps.push({ x: VX[i] + side * 10, z, rot: side > 0 ? Math.PI : 0 });
      }
    }
  }
  for (let j = 0; j < VZ.length; j++) {
    if (!isMainZ(j)) continue;
    for (let i = 0; i + 1 < VX.length; i++) {
      const len = VX[i + 1] - VX[i];
      const nLamp = Math.floor(len / 40);
      for (let k = 0; k < nLamp; k++) {
        const x = VX[i] + (len / (nLamp + 1)) * (k + 1);
        const side = k % 2 === 0 ? 1 : -1;
        lamps.push({ x, z: VZ[j] + side * 10, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    }
  }

  const carColors = ['#c94f4f', '#4f7dc9', '#4fc97a', '#c9b24f', '#8a8f96', '#7a4fc9', '#c94f9d'];
  const parkedCars: { x: number; z: number; rot: number; color: string }[] = [];
  for (let c = 0; c < 14; c++) {
    const cust = customers[Math.floor(rng() * customers.length)];
    const vertical = rng() < 0.5;
    parkedCars.push({
      x: cust.x + (vertical ? 0 : (rng() < 0.5 ? -6 : 6)),
      z: cust.z + (vertical ? (rng() < 0.5 ? -6 : 6) : 0),
      rot: vertical ? 0 : Math.PI / 2,
      color: carColors[Math.floor(rng() * carColors.length)],
    });
  }

  return {
    roads,
    buildings,
    trees,
    lamps,
    parkedCars,
    customers,
    dc: {
      x: -120, z: -80,
      loadZone: { x: -120, z: -57 },
      depositZone: { x: -151, z: -80 },
      spawn: { x: -120, z: -63 },
    },
    bounds: { minX: -185, maxX: 185, minZ: -145, maxZ: 145 },
    grid: { xs: VX, zs: VZ },
  };
}
