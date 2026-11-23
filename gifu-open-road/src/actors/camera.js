// 三人称カメラ（徒歩・運転・構え・スコープ）。建物にめり込まないよう距離を縮める
import { CAMERA } from '../core/config.js';
import { solidAt } from '../world/mapgen.js';
import { sampleH } from '../world/terrain.js';
import { angDiff, clamp } from '../core/rng.js';

export function createCam(G, camera) {
  const C = { yaw: 0, pitch: 0.18, dist: CAMERA.dist, shake: 0, idleLook: 0, view: 0, fov: CAMERA.fov, x: 0, y: 0, z: 0, assistK: 1 };
  C.camera = camera;
  C.forward = () => [Math.sin(C.yaw) * Math.cos(C.pitch), -Math.sin(C.pitch), Math.cos(C.yaw) * Math.cos(C.pitch)];
  C.update = function (P, cmd, dt, aiming, scope) {
    const lk = C.assistK;
    C.yaw -= cmd.lookX * lk; C.pitch = clamp(C.pitch + cmd.lookY * lk, -0.75, 1.2);
    if (Math.abs(cmd.lookX) + Math.abs(cmd.lookY) > 0.0005) C.idleLook = 0; else C.idleLook += dt;
    if (cmd.cam) C.view = (C.view + 1) % 3;
    let tx = P.x, ty = P.y + 1.55, tz = P.z, dist = CAMERA.dist, side = 0, fov = CAMERA.fov;
    if (P.inCar) {
      const car = P.car.phys, spec = P.car.spec;
      // 一定時間視点を動かさなければ車の後ろへ戻る
      if (C.idleLook > 1.2) { const back = car.vf < -1 ? car.heading + Math.PI : car.heading; C.yaw += angDiff(C.yaw, back) * Math.min(1, dt * 2.5); C.pitch += (0.2 - C.pitch) * Math.min(1, dt * 2); }
      dist = [CAMERA.driveDist + spec.len * 0.4, CAMERA.driveDist * 1.6 + spec.len * 0.4, 0.01][C.view];
      ty = car.y + spec.hgt + (C.view === 2 ? -0.25 : 1.2);
      if (C.view === 2) { tx = car.x + Math.sin(car.heading) * 0.3 - Math.cos(car.heading) * 0.35; tz = car.z + Math.cos(car.heading) * 0.3 + Math.sin(car.heading) * 0.35; }
      fov = CAMERA.fov + Math.min(14, Math.abs(car.vf) * 0.25);
    } else if (aiming) {
      dist = CAMERA.aimDist; side = 0.65; fov = scope ? CAMERA.scopeFov : CAMERA.aimFov; ty = P.y + 1.6;
      if (scope) { dist = 0.01; side = 0; }
    } else dist = [CAMERA.dist, CAMERA.dist * 1.5, 3.5][C.view];
    C.dist += (dist - C.dist) * Math.min(1, dt * 8);
    C.fov += (fov - C.fov) * Math.min(1, dt * 8);
    const f = C.forward();
    const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw);
    tx += rx * side; tz += rz * side;
    // 衝突：注視点から後ろへ少しずつ伸ばす
    let d = C.dist;
    for (let s = 0.4; s < C.dist; s += 0.4) {
      const x = tx - f[0] * s, y = ty - f[1] * s, z = tz - f[2] * s;
      if (solidAt(G.world, x, z, y) || y < sampleH(G.world, x, z) + 0.3) { d = Math.max(0.3, s - 0.4); break; }
    }
    let cx = tx - f[0] * d, cy = ty - f[1] * d, cz = tz - f[2] * d;
    cy = Math.max(cy, sampleH(G.world, cx, cz) + 0.4);
    if (C.shake > 0) { cx += (Math.random() - 0.5) * C.shake; cy += (Math.random() - 0.5) * C.shake; cz += (Math.random() - 0.5) * C.shake; C.shake = Math.max(0, C.shake - dt * 2.5); }
    camera.position.set(cx, cy, cz);
    camera.lookAt(tx + f[0] * 10, ty + f[1] * 10, tz + f[2] * 10);
    if (Math.abs(camera.fov - C.fov) > 0.05) { camera.fov = C.fov; camera.updateProjectionMatrix(); }
    C.x = cx; C.y = cy; C.z = cz;
  };
  return C;
}
