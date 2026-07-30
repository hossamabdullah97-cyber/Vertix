/* ============================================================================
   Vertex Connect Enterprise Design System — Motion & Animation Configurations
   Preconfigured framer-motion variants and transitions for uniform UX.
   ============================================================================ */

import type { Transition, Variants } from 'framer-motion';

// Global transitions configuration (Apple / Linear style easing)
export const transitionNormal: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 0.8
};

export const transitionFast: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 35,
  mass: 0.6
};

export const transitionSlow: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 1
};

// Reusable Framer Motion Variants
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: transitionNormal
  },
  exit: { 
    opacity: 0, 
    scale: 0.96, 
    y: 10,
    transition: { duration: 0.15, ease: 'easeIn' }
  }
};

export const dropdownVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: transitionFast
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: -4,
    transition: { duration: 0.1, ease: 'easeIn' }
  }
};

export const sidebarVariants: Variants = {
  collapsed: { width: 72, transition: transitionNormal },
  expanded: { width: 260, transition: transitionNormal }
};

export const pageFadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }
};
