// GSAP y sus plugins, registrados una sola vez. Los componentes importan desde aquí, nunca desde 'gsap' directamente.
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(Flip, ScrollTrigger, SplitText, DrawSVGPlugin, Physics2DPlugin);

/** Las dos curvas del sistema en nombres de GSAP: entrada ≈ cubic-bezier(.16,1,.3,1), cambio ≈ cubic-bezier(.66,0,.1,1). */
export const CURVA = { entrada: 'power4.out', cambio: 'power3.inOut' } as const;

export { gsap, Flip, ScrollTrigger, SplitText };
