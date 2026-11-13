// El sello en relieve: un sello en seco estampado en la hoja, dibujado con three.js.
// Este módulo (y three con él) solo se descarga cuando hace falta: lo importa SelloRelieve de forma diferida.
// anime.js mueve objetos planos (la altura de cada trazo) y three los dibuja en cada fotograma.
import { animate as moverObjeto, createTimeline, stagger, type Timeline } from 'animejs';
import { animate as resorte } from 'motion';
import * as THREE from 'three';
import { PASO_TRAZO, RADIO_INTERIOR, SELLO, claseEvento, radiosDe } from '../../lib/sello';
import { prefersReducedMotion } from '../../motion/motion';

export interface DatosRelieve { tipos: readonly string[]; hashFinal: string; cifra: string; orla: string; lema: string }
export interface OpcionesRelieve {
  /** Qué parte del lado corto del lienzo ocupa el sello (0 a 1). Puede depender del ancho del lienzo. */
  encuadre?: number | ((ancho: number) => number);
  /** Dónde se sigue al puntero. Por defecto, la propia caja del sello; puede ser la pantalla entera. */
  zona?: HTMLElement;
  /** Cuánto se inclina el sello hacia el puntero. */
  inclinacion?: number;
}
export interface Escena {
  /** Lleva el relieve a su estado: desde cero (los trazos emergen uno a uno) o desde donde esté. */
  animar(desdeCero: boolean): void;
  /** Cadena rota en esa posición (el relieve se hunde desde ahí) o íntegra con null. Vuelve a grabar las letras. */
  ruptura(posicion: number | null, orla: string, lema: string): void;
  /** Relee el color del papel de los tokens CSS. */
  tema(): void;
  visible(v: boolean): void;
  /** El golpe de estampar: los trazos vuelven a levantarse de golpe, el sello se hunde y rebota, y la luz destella. */
  estampar(): Promise<void>;
  /** Lleva la luz a una posición (x e y entre -1 y 1 respecto al sello) durante unos segundos. */
  luzDesde(x: number, y: number): void;
  destruir(): void;
}

const U = 1.5 / SELLO.centro, TAU = Math.PI * 2, PUNTOS = 220;
/** Diámetro del disco en unidades de la escena, y la tangente de media apertura de la cámara (26°). */
const DIAMETRO = 3.08, TAN = Math.tan((13 * Math.PI) / 180);

export function crearEscena(canvas: HTMLCanvasElement, caja: HTMLElement, datos: DatosRelieve, op: OpcionesRelieve = {}): Escena {
  const N = datos.tipos.length, raiz = document.documentElement;
  // Por defecto, el encuadre de siempre: el sello llena el 88 % de una caja cuadrada
  const encuadre = op.encuadre ?? 0.878, zona = op.zona ?? caja, inclinacion = op.inclinacion ?? 0.32;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   // nunca más de 2
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.1, 40); cam.position.set(0, 0, 7.6);
  const amb = new THREE.AmbientLight(0xffffff, 1.75), luz = new THREE.DirectionalLight(0xffffff, 3.4);
  luz.castShadow = true; luz.shadow.mapSize.set(1024, 1024); luz.shadow.bias = -0.0008; luz.shadow.radius = 5;
  Object.assign(luz.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 14 });
  scene.add(amb, luz);
  // Todo es papel: sin tinta, el relieve solo se ve por la luz
  const papel = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const grupo = new THREE.Group(); scene.add(grupo);
  const disco = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.54, 0.06, 128), papel); disco.rotation.x = Math.PI / 2; disco.receiveShadow = true; grupo.add(disco);

  // La cifra, el lema y la orla van como mapa de relieve sobre la cara.
  // En ese lienzo, blanco significa "más alto": son alturas, no colores de la interfaz.
  const lienzo = document.createElement('canvas'); lienzo.width = lienzo.height = 1024;
  const tex = new THREE.CanvasTexture(lienzo);
  const caraMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, bumpMap: tex, bumpScale: 0 });
  const cara = new THREE.Mesh(new THREE.CircleGeometry(1.5, 128), caraMat); cara.position.z = 0.031; cara.receiveShadow = true; grupo.add(cara);
  function grabar(orla: string, lema: string) {
    const c = lienzo.getContext('2d'); if (!c) return;
    const cs = getComputedStyle(raiz), f = (n: string) => cs.getPropertyValue(`--f-${n}`).trim();
    c.filter = 'none'; c.fillStyle = '#000'; c.fillRect(0, 0, 1024, 1024);
    c.filter = 'blur(2.4px)'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 132px ${f('acc')}`; c.fillText(datos.cifra, 512, 498);
    c.font = `600 34px ${f('text')}`; if ('letterSpacing' in c) c.letterSpacing = '7px'; c.fillText(lema, 512, 592); if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.font = `700 33px ${f('mono')}`; const rad = (84 / SELLO.centro) * 512, letras = [...orla];
    letras.forEach((ch, i) => { c.save(); c.translate(512, 512); c.rotate((i / letras.length) * TAU); c.fillText(ch, 0, -rad); c.restore(); });
    tex.needsUpdate = true;
  }

  // Un bloque por eslabón (InstancedMesh): su largo depende del tipo de evento; su altura la mueve anime.js
  const trazos = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), papel, N); trazos.castShadow = true; trazos.receiveShadow = true; grupo.add(trazos);
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), esc = new THREE.Vector3(), ejeZ = new THREE.Vector3(0, 0, 1);
  const geo = datos.tipos.map((tipo, i) => { const t = claseEvento(tipo), a = (i / N) * TAU, rm = ((SELLO.radioExterior + RADIO_INTERIOR[t]) / 2) * U; return { x: rm * Math.sin(a), y: rm * Math.cos(a), a, largo: (SELLO.radioExterior - RADIO_INTERIOR[t]) * U, ancho: t === 'CIE' ? 0.075 : 0.042 }; });
  // La roseta del hash final, como tres cordones en relieve
  const roseta = new THREE.Group(); roseta.position.z = 0.03; grupo.add(roseta);
  for (const radios of radiosDe(datos.hashFinal, PUNTOS)) {
    const pts = radios.slice(0, PUNTOS).map((r, i) => { const t = (i / PUNTOS) * TAU; return new THREE.Vector3(r * U * Math.cos(t), r * U * Math.sin(t), 0); });
    const cordon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 360, 0.02, 8, true), papel); cordon.castShadow = true; roseta.add(cordon);
  }

  // Objetos planos que anima anime.js; three solo los lee
  const alt = datos.tipos.map(() => ({ a: 0 })), ros = { a: 0 }, letras = { a: 0 }, gr = { s: 1 }, destello = { l: 0 };
  const REPOSO = { rx: 0, ry: 0, lx: -1.7, ly: 2.1 }, meta = { ...REPOSO }, cur = { ...REPOSO };
  let raf = 0, tPuntero = -1e9, linea: Timeline | null = null, relieveTexto = 9, enVista = false, rota: number | null = null, vivo = true, luzBase = 3.4;

  function pintar() {
    geo.forEach((g, i) => { pos.set(g.x, g.y, 0.03); quat.setFromAxisAngle(ejeZ, -g.a); esc.set(g.ancho, g.largo, Math.max(0.001, alt[i]!.a * 0.17)); m4.compose(pos, quat, esc); trazos.setMatrixAt(i, m4); });
    trazos.instanceMatrix.needsUpdate = true;
    roseta.scale.z = Math.max(0.001, ros.a * 2.6); roseta.visible = ros.a > 0.01; caraMat.bumpScale = letras.a * relieveTexto;
    grupo.rotation.set(cur.rx, cur.ry, 0); grupo.scale.setScalar(gr.s); luz.position.set(cur.lx, cur.ly, 2.1); luz.intensity = luzBase * (1 + destello.l);
    renderer.render(scene, cam);
    canvas.dataset.triangulos = String(renderer.info.render.triangles);
  }
  function cuadro(t: number) {
    raf = 0;
    if (!vivo || !enVista) return;   // fuera de pantalla no se dibuja
    if (prefersReducedMotion()) { Object.assign(cur, REPOSO); pintar(); return; }   // un fotograma y quieto
    // Sin puntero, la luz da una vuelta lenta alrededor del sello
    if (t - tPuntero > 2500) { const a = t / 2800; meta.lx = Math.cos(a) * 2.4; meta.ly = Math.sin(a) * 2.4; meta.rx = Math.sin(a) * 0.1; meta.ry = Math.cos(a) * 0.1; }
    (Object.keys(cur) as (keyof typeof cur)[]).forEach(k => { cur[k] += (meta[k] - cur[k]) * 0.08; });
    pintar(); raf = requestAnimationFrame(cuadro);
  }
  const despertar = () => { if (!raf && vivo && enVista) raf = requestAnimationFrame(cuadro); };
  const objetivo = (i: number) => (rota !== null && i + 1 >= rota ? 0 : 1);

  function animar(desdeCero: boolean) {
    // cancel(), no pause(): con una línea en pausa sobre los mismos objetos, anime.js deja sin mover los trazos que aún no habían empezado
    linea?.cancel();
    if (prefersReducedMotion()) { alt.forEach((o, i) => { o.a = objetivo(i); }); ros.a = rota !== null ? 0 : 1; letras.a = 1; gr.s = 1; despertar(); return; }
    if (desdeCero) { alt.forEach(o => { o.a = 0; }); ros.a = 0; letras.a = 0; }
    linea = createTimeline({ onComplete: () => { if (desdeCero && rota === null) resorte(1.1, 1, { type: 'spring', stiffness: 360, damping: 11, onUpdate: v => { gr.s = v; } }); } })
      .add(alt, { a: (_?: unknown, i?: number) => objetivo(i ?? 0), duration: 560, ease: desdeCero ? 'outBack' : 'inOutQuad', delay: stagger(desdeCero ? PASO_TRAZO : 26, { from: desdeCero || rota === null ? 'first' : rota - 1 }) })
      .add(ros, { a: rota !== null ? 0 : 1, duration: 800, ease: 'outExpo' }, desdeCero ? '-=400' : 0)
      .add(letras, { a: 1, duration: 700, ease: 'outExpo' }, desdeCero ? '-=700' : 0);
    despertar();
  }
  function tema() {
    const c = getComputedStyle(raiz).getPropertyValue('--surface').trim();
    papel.color.set(c); caraMat.color.set(c);
    // En papel claro el relieve se lee por las sombras; en papel oscuro, por los brillos
    const oscuro = 0.2126 * papel.color.r + 0.7152 * papel.color.g + 0.0722 * papel.color.b < 0.2;
    amb.intensity = oscuro ? 2.6 : 1.75; luzBase = oscuro ? 9 : 3.4; papel.roughness = caraMat.roughness = oscuro ? 0.5 : 0.85; relieveTexto = oscuro ? 14 : 9;
    despertar();
  }
  // La cámara encuadra el sello según el lado corto del lienzo, sea cuadrado o no
  function tam() {
    const w = canvas.clientWidth || caja.clientWidth, h = canvas.clientHeight || caja.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    const f = typeof encuadre === 'function' ? encuadre(w) : encuadre;
    cam.position.z = DIAMETRO / f / Math.min(1, cam.aspect) / (2 * TAN); cam.updateProjectionMatrix(); despertar();
  }
  // La luz sigue al puntero en la zona indicada; fuera de la caja del sello, con un tope para que no se vaya demasiado lejos
  const alMover = (e: PointerEvent) => {
    if (zona !== caja && e.pointerType !== 'mouse') return;
    const r = caja.getBoundingClientRect(), tope = (v: number) => Math.max(-1.6, Math.min(1.6, v));
    const x = tope(((e.clientX - r.left) / r.width) * 2 - 1), y = tope(-(((e.clientY - r.top) / r.height) * 2 - 1));
    tPuntero = performance.now(); Object.assign(meta, { lx: x * 3, ly: y * 3, rx: -y * inclinacion, ry: x * inclinacion }); despertar();
  };
  const alSalir = () => { tPuntero = -1e9; };
  zona.addEventListener('pointermove', alMover); zona.addEventListener('pointerleave', alSalir);
  const ro = new ResizeObserver(tam); ro.observe(caja); ro.observe(canvas);
  grabar(datos.orla, datos.lema); tema(); tam();

  return {
    animar,
    ruptura(posicion, orla, lema) { rota = posicion; grabar(orla, lema); },
    tema,
    visible(v) { enVista = v; despertar(); },
    estampar() {
      if (prefersReducedMotion()) return Promise.resolve();
      linea?.cancel(); alt.forEach(o => { o.a = 0; }); ros.a = 0;
      return new Promise<void>(listo => {
        linea = createTimeline({ onComplete: () => {
          resorte(0.93, 1, { type: 'spring', stiffness: 340, damping: 11, onUpdate: v => { gr.s = v; } });
          moverObjeto(destello, { l: [0.9, 0], duration: 900, ease: 'outExpo' });
          listo();
        } })
          .add(alt, { a: (_?: unknown, i?: number) => objetivo(i ?? 0), duration: 380, ease: 'outBack', delay: stagger(12) })
          .add(ros, { a: rota !== null ? 0 : 1, duration: 800, ease: 'outExpo' }, '-=300');
        despertar();
      });
    },
    luzDesde(x, y) { tPuntero = performance.now() + 4000; Object.assign(meta, { lx: x * 3, ly: y * 3, rx: -y * inclinacion * 0.5, ry: x * inclinacion * 0.5 }); despertar(); },
    destruir() {
      vivo = false; cancelAnimationFrame(raf); linea?.cancel(); ro.disconnect();
      zona.removeEventListener('pointermove', alMover); zona.removeEventListener('pointerleave', alSalir);
      scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      papel.dispose(); caraMat.dispose(); tex.dispose(); renderer.dispose();
    },
  };
}
