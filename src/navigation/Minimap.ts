// ============ Minimap 2D + perencana rute berbasis graf jalan ============
import type { WorldData } from '../data/types';

interface Node { x: number; z: number; }

/** Dijkstra sederhana atas graf persimpangan jalan. */
export class RoutePlanner {
  private nodes: Node[] = [];
  private adj: Map<number, { to: number; w: number }[]> = new Map();
  private xs: number[];
  private zs: number[];

  constructor(world: WorldData) {
    this.xs = world.grid.xs;
    this.zs = world.grid.zs;
    for (const x of this.xs) for (const z of this.zs) this.nodes.push({ x, z });
    for (let i = 0; i < this.nodes.length; i++) {
      const r = Math.floor(i / this.zs.length);
      const c = i % this.zs.length;
      const edges: { to: number; w: number }[] = [];
      if (c + 1 < this.zs.length) {
        const j = r * this.zs.length + c + 1;
        edges.push({ to: j, w: Math.abs(this.zs[c + 1] - this.zs[c]) });
      }
      if (r + 1 < this.xs.length) {
        const j = (r + 1) * this.zs.length + c;
        edges.push({ to: j, w: Math.abs(this.xs[r + 1] - this.xs[r]) });
      }
      if (c - 1 >= 0) {
        const j = r * this.zs.length + c - 1;
        edges.push({ to: j, w: Math.abs(this.zs[c] - this.zs[c - 1]) });
      }
      if (r - 1 >= 0) {
        const j = (r - 1) * this.zs.length + c;
        edges.push({ to: j, w: Math.abs(this.xs[r] - this.xs[r - 1]) });
      }
      this.adj.set(i, edges);
    }
  }

  private nearestNode(x: number, z: number): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = (this.nodes[i].x - x) ** 2 + (this.nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** Rute dari pemain ke tujuan; titik pertama & terakhir adalah posisi nyata. */
  route(fromX: number, fromZ: number, toX: number, toZ: number): { points: { x: number; z: number }[]; distance: number } {
    const start = this.nearestNode(fromX, fromZ);
    const goal = this.nearestNode(toX, toZ);
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const visited = new Set<number>();
    dist.set(start, 0);
    for (;;) {
      let u = -1, ud = Infinity;
      for (const [n, d] of dist) if (!visited.has(n) && d < ud) { ud = d; u = n; }
      if (u === -1 || u === goal) break;
      visited.add(u);
      for (const e of this.adj.get(u) ?? []) {
        const nd = ud + e.w;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, u);
        }
      }
    }
    const path: Node[] = [];
    let cur: number | undefined = goal;
    while (cur !== undefined) {
      path.unshift(this.nodes[cur]);
      cur = prev.get(cur);
    }
    if (path.length === 0) path.push(this.nodes[start], this.nodes[goal]);
    const points = [{ x: fromX, z: fromZ }, ...path.map(p => ({ x: p.x, z: p.z })), { x: toX, z: toZ }];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    }
    return { points, distance: total };
  }
}

export interface MinimapData {
  playerX: number;
  playerZ: number;
  playerHeading: number;
  dc: { x: number; z: number };
  targets: { x: number; z: number; state: 'pending' | 'active' | 'done' }[];
  routePoints: { x: number; z: number }[];
}

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private world: WorldData;
  private t = 0;

  constructor(canvas: HTMLCanvasElement, world: WorldData) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia');
    this.ctx = ctx;
    this.world = world;
  }

  /** Peta dunia (x,z) -> kanvas; orientasi utara di atas. */
  private toScreen(x: number, z: number): [number, number] {
    const { minX, maxX, minZ, maxZ } = this.world.bounds;
    const sx = ((x - minX) / (maxX - minX)) * (this.canvas.width - 16) + 8;
    const sy = ((z - minZ) / (maxZ - minZ)) * (this.canvas.height - 16) + 8;
    return [sx, sy];
  }

  render(data: MinimapData, dt: number): void {
    this.t += dt;
    const ctx = this.ctx;
    const { width: W, height: H } = this.canvas;
    ctx.clearRect(0, 0, W, H);

    // latar
    ctx.fillStyle = '#171c22';
    ctx.fillRect(0, 0, W, H);

    // blok kota (bangunan abu redup)
    ctx.fillStyle = '#2a323b';
    for (const b of this.world.buildings) {
      const [x, y] = this.toScreen(b.x - b.w / 2, b.z - b.d / 2);
      const w = (b.w / (this.world.bounds.maxX - this.world.bounds.minX)) * (W - 16);
      const h = (b.d / (this.world.bounds.maxZ - this.world.bounds.minZ)) * (H - 16);
      ctx.fillRect(x, y, w, h);
    }

    // jalan
    for (const r of this.world.roads) {
      ctx.strokeStyle = r.type === 'main' ? '#4a545e' : '#3c444d';
      ctx.lineWidth = r.type === 'main' ? 5 : 3;
      const [x1, y1] = this.toScreen(r.x1, r.z1);
      const [x2, y2] = this.toScreen(r.x2, r.z2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // rute
    if (data.routePoints.length > 1) {
      ctx.strokeStyle = '#ff8a24';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      data.routePoints.forEach((p, i) => {
        const [x, y] = this.toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // DC
    const [dcx, dcy] = this.toScreen(data.dc.x, data.dc.z);
    ctx.fillStyle = '#4da3ff';
    ctx.fillRect(dcx - 5, dcy - 5, 10, 10);
    ctx.strokeStyle = '#0d1217';
    ctx.lineWidth = 1;
    ctx.strokeRect(dcx - 5, dcy - 5, 10, 10);

    // pelanggan
    for (const t of data.targets) {
      const [x, y] = this.toScreen(t.x, t.z);
      const color = t.state === 'active' ? '#ff8a24' : t.state === 'done' ? '#38b878' : '#aebbc7';
      const pulse = t.state === 'active' ? 4 + Math.sin(this.t * 5) * 1.5 : 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0d1217';
      ctx.stroke();
      if (t.state === 'done') {
        ctx.strokeStyle = '#0d1217';
        ctx.beginPath();
        ctx.moveTo(x - 2, y);
        ctx.lineTo(x + 2, y - 3);
        ctx.lineTo(x + 4, y + 2);
        ctx.stroke();
      }
    }

    // pemain (segitiga mengikuti arah)
    const [px, py] = this.toScreen(data.playerX, data.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(data.playerHeading), -Math.cos(data.playerHeading)));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0d1217';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}
