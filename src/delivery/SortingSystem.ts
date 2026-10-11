// ============ Sistem perhitungan penyortiran, packing, rute & evaluasi ============
import type { PackageRuntime, CustomerRuntime } from './DeliveryManager';
import type { VehicleSpec } from '../data/types';
import { PACKAGE_DIMS } from '../data/types';

export interface PackedPackage {
  id: string;
  weight: number;
  volumeM3: number;
  fragile: boolean;
  customerId: string;
  layer: 'dasar' | 'tengah' | 'atas';   // posisi packing: berat di dasar
  zone: string;
}

export interface SortingReport {
  packageCount: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  weightCapacityPct: number;
  volumeCapacityPct: number;
  weightOk: boolean;
  volumeOk: boolean;
  countOk: boolean;
  zones: { zone: string; count: number; weightKg: number }[];
  packed: PackedPackage[];               // urutan muat (dasar -> atas)
  fragileCount: number;
  axleFrontKg: number;                   // estimasi beban poros depan
  axleRearKg: number;                    // estimasi beban poros belakang
  axleNote: string;
  verdict: string;
}

export interface RouteReport {
  legs: { target: string; distanceM: number }[];
  totalDistanceKm: number;
  fuelEstimateL: number;
  timeEstimateMin: number;
  potentialRevenue: number;
}

export interface EvaluationMath {
  deliveryRate: number;
  onTime: boolean;
  damageCost: number;
  fuelUsedL: number;
  fuelCost: number;
  grossRevenue: number;
  baseSalary: number;
  bonuses: { label: string; amount: number }[];
  penalties: { label: string; amount: number }[];
  netPay: number;
}

const FUEL_PRICE = 12000; // Rp per liter

/** Volume satu paket dalam m³ berdasarkan dimensi kemasan. */
export function packageVolumeM3(size: 'S' | 'M' | 'L'): number {
  const d = PACKAGE_DIMS[size];
  return (d.l * d.w * d.h) / 1_000_000;
}

/** Tentukan zona pengiriman relatif terhadap DC. */
export function zoneOf(cx: number, cz: number, x: number, z: number): string {
  const dx = x - cx;
  const dz = z - cz;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'Zona Timur' : 'Zona Barat';
  return dz > 0 ? 'Zona Selatan' : 'Zona Utara';
}

/**
 * Perhitungan penyortiran lengkap (dipakai penyortir sebelum packing):
 * kapasitas, zona, aturan packing (berat di dasar, fragile di atas),
 * dan estimasi distribusi beban poros.
 */
export function computeSorting(
  packages: PackageRuntime[],
  vehicle: VehicleSpec,
  dc: { x: number; z: number },
  customerPositions: Map<string, { x: number; z: number }>,
): SortingReport {
  let totalWeightKg = 0;
  let totalVolumeM3 = 0;
  let fragileCount = 0;
  const zoneMap = new Map<string, { count: number; weightKg: number }>();

  for (const p of packages) {
    totalWeightKg += p.weight;
    totalVolumeM3 += packageVolumeM3(p.size);
    if (p.fragile) fragileCount++;
    const pos = customerPositions.get(p.customerId);
    const zone = pos ? zoneOf(dc.x, dc.z, pos.x, pos.z) : 'Zona Lain';
    const z = zoneMap.get(zone) ?? { count: 0, weightKg: 0 };
    z.count++; z.weightKg += p.weight;
    zoneMap.set(zone, z);
  }

  // ---------- Aturan packing ----------
  // 1. urutkan: terberat di dasar bak (dekat poros), terringan di atas
  // 2. barang fragile SELALU di lapisan atas
  const sorted = [...packages].sort((a, b) => {
    const fa = a.fragile ? 1 : 0;
    const fb = b.fragile ? 1 : 0;
    if (fa !== fb) return fa - fb;        // non-fragile dulu (bawah)
    return b.weight - a.weight;           // berat dulu (bawah)
  });

  const n = sorted.length;
  const packed: PackedPackage[] = sorted.map((p, i) => {
    const pos = customerPositions.get(p.customerId);
    const zone = pos ? zoneOf(dc.x, dc.z, pos.x, pos.z) : 'Zona Lain';
    const layer: PackedPackage['layer'] = i < n / 3 ? 'dasar' : i < (2 * n) / 3 ? 'tengah' : 'atas';
    return {
      id: p.id,
      weight: p.weight,
      volumeM3: packageVolumeM3(p.size),
      fragile: !!p.fragile,
      customerId: p.customerId,
      layer,
      zone,
    };
  });

  // ---------- Estimasi distribusi beban poros ----------
  // Berat di lapisan dasar cenderung ke poros belakang (dekat pintu belakang),
  // berat di atas & depan mengurangi beban belakang. Model sederhana namun wajar:
  // front ~45% dasar, rear ~55% dasar; muatan atas menggeser ke depan.
  let axleFrontKg = 0;
  let axleRearKg = 0;
  for (const p of packed) {
    const w = p.weight;
    if (p.layer === 'dasar') { axleFrontKg += w * 0.45; axleRearKg += w * 0.55; }
    else if (p.layer === 'tengah') { axleFrontKg += w * 0.5; axleRearKg += w * 0.5; }
    else { axleFrontKg += w * 0.6; axleRearKg += w * 0.4; }
  }

  const weightCapacityPct = (totalWeightKg / vehicle.cargoWeight) * 100;
  const volumeCapacityPct = (totalVolumeM3 / vehicle.cargoVolume) * 100;
  const weightOk = totalWeightKg <= vehicle.cargoWeight;
  const volumeOk = totalVolumeM3 <= vehicle.cargoVolume;
  const countOk = packages.length <= vehicle.capacity;

  let verdict: string;
  if (!countOk) verdict = `GAGAL: jumlah paket (${packages.length}) melebihi kapasitas kendaraan (${vehicle.capacity}).`;
  else if (!weightOk) verdict = `GAGAL: total berat ${totalWeightKg.toFixed(1)} kg melebihi kapasitas ${vehicle.cargoWeight} kg.`;
  else if (!volumeOk) verdict = `GAGAL: total volume ${totalVolumeM3.toFixed(2)} m³ melebihi kapasitas ${vehicle.cargoVolume} m³.`;
  else verdict = `AMAN: ${weightCapacityPct.toFixed(0)}% kapasitas berat, ${volumeCapacityPct.toFixed(0)}% volume — siap dimuat.`;

  return {
    packageCount: packages.length,
    totalWeightKg,
    totalVolumeM3,
    weightCapacityPct,
    volumeCapacityPct,
    weightOk, volumeOk, countOk,
    zones: [...zoneMap.entries()].map(([zone, v]) => ({ zone, count: v.count, weightKg: v.weightKg })),
    packed,
    fragileCount,
    axleFrontKg,
    axleRearKg,
    axleNote: `Estimasi beban poros: depan ${axleFrontKg.toFixed(1)} kg / belakang ${axleRearKg.toFixed(1)} kg (muatan berat diletakkan di dasar bak dekat poros belakang).`,
    verdict,
  };
}

/** Perhitungan rute kurir: jarak total (node jalan), estimasi BBM, waktu, dan pendapatan. */
export function computeRoute(
  legs: { target: string; distanceM: number }[],
  customers: CustomerRuntime[],
  fuelCapacityL: number,
  fuelUsePerSec: number,
  avgSpeedKmh: number,
): RouteReport {
  const totalDistanceKm = legs.reduce((s, l) => s + l.distanceM, 0) / 1000;
  // asumsi konsumsi: ~10 liter/100km pada kecepatan rata-rata + idle
  const fuelEstimateL = (totalDistanceKm / 100) * 10 + (totalDistanceKm / avgSpeedKmh) * 0.6;
  const timeEstimateMin = (totalDistanceKm / avgSpeedKmh) * 60;
  const potentialRevenue = customers.reduce((s, c) => s + c.payment, 0);
  void fuelCapacityL; void fuelUsePerSec;
  return { legs, totalDistanceKm, fuelEstimateL, timeEstimateMin, potentialRevenue };
}

/** Perhitungan evaluasi manajer: rincian matematis gaji. */
export function computeEvaluationMath(params: {
  delivered: number;
  total: number;
  onTime: boolean;
  damage: number;
  fuelLeftPct: number;
  fuelCapacity: number;
  level: number;
  baseSalaryPerLevel: number;
  receivedPayments: number;
  deposited: number;
  discrepancy: number;
  bonuses: { label: string; amount: number }[];
  penalties: { label: string; amount: number }[];
}): EvaluationMath {
  const fuelUsedL = ((100 - params.fuelLeftPct) / 100) * params.fuelCapacity;
  const fuelCost = fuelUsedL * FUEL_PRICE;
  const deliveryRate = params.total > 0 ? (params.delivered / params.total) * 100 : 0;
  const damageCost = params.damage * 6000;
  const baseSalary = params.baseSalaryPerLevel * Math.max(1, params.level);
  const grossRevenue = params.receivedPayments;
  const netPay = Math.max(0,
    baseSalary + params.bonuses.reduce((s, b) => s + b.amount, 0)
    - params.penalties.reduce((s, p) => s + p.amount, 0));

  return {
    deliveryRate,
    onTime: params.onTime,
    damageCost,
    fuelUsedL,
    fuelCost,
    grossRevenue,
    baseSalary,
    bonuses: params.bonuses,
    penalties: params.penalties,
    netPay,
  };
}
