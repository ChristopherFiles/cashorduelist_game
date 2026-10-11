// ============ Kamera bird's-eye mengikuti pemain ============
import * as BABYLON from 'babylonjs';

export class BirdEyeCamera {
  camera: BABYLON.TargetCamera;
  distance = 30;       // tinggi kamera
  offset = 14;         // jarak di belakang entitas
  lookAhead = 11;      // seberapa jauh melihat ke depan
  private smoothHeading = Math.PI;
  private orbitAngle = 0;

  constructor(scene: BABYLON.Scene) {
    this.camera = new BABYLON.TargetCamera('bird', new BABYLON.Vector3(0, 40, 20), scene);
    this.camera.setTarget(BABYLON.Vector3.Zero());
    scene.activeCamera = this.camera;
  }

  zoom(delta: number): void {
    this.distance = Math.max(18, Math.min(48, this.distance + delta));
    this.offset = Math.max(8, Math.min(26, this.offset + delta * 0.5));
  }

  /** Kamera mengejar entitas: posisi di BELAKANG (entity - forward*offset), melihat ke depan.
   *  Pemain selalu terlihat di layar, searah hadap kamera. */
  follow(dt: number, tx: number, tz: number, heading: number): void {
    const k = Math.min(1, dt * 6);

    // haluskan perubahan heading agar kamera tidak berputar kaku
    let diff = heading - this.smoothHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.smoothHeading += diff * k;

    const fx = Math.sin(this.smoothHeading);
    const fz = Math.cos(this.smoothHeading);

    const desiredX = tx - fx * this.offset;
    const desiredZ = tz - fz * this.offset;
    this.camera.position.x += (desiredX - this.camera.position.x) * k;
    this.camera.position.z += (desiredZ - this.camera.position.z) * k;
    this.camera.position.y = this.distance;

    // target: entitas + sedikit ke depan agar jalan di depan terlihat
    this.camera.setTarget(new BABYLON.Vector3(tx + fx * this.lookAhead, 0, tz + fz * this.lookAhead));
  }

  /** kamera orbit lambat untuk backdrop menu utama */
  orbit(dt: number, cx: number, cz: number): void {
    this.orbitAngle += dt * 0.08;
    const r = 42;
    this.camera.position.x = cx + Math.sin(this.orbitAngle) * r;
    this.camera.position.z = cz + Math.cos(this.orbitAngle) * r;
    this.camera.position.y = 30;
    this.camera.setTarget(new BABYLON.Vector3(cx, 2, cz));
  }
}
