/* ============================================================================
   Vertex Connect Enterprise Design System — Public Entry Export
   Central module to export tokens, motion properties, and components.
   ============================================================================ */

// 1. Export Tokens
export { default as tokens, tokens as dsTokens } from './tokens';

// 2. Export Animations & Transitions
export {
  transitionNormal,
  transitionFast,
  transitionSlow,
  modalVariants,
  dropdownVariants,
  sidebarVariants,
  pageFadeVariants,
} from './animations/transitions';

// 3. Export Components
export { default as Button, type ButtonProps } from './components/Button';

export {
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Switch,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type CheckboxProps,
  type RadioProps,
  type SwitchProps,
} from './components/Form';

export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  type CardProps,
} from './components/Card';

export {
  Badge,
  Alert,
  ProgressBar,
  Skeleton,
  Toast,
  Tooltip,
  type BadgeProps,
  type AlertProps,
  type ProgressBarProps,
  type SkeletonProps,
  type ToastProps,
  type TooltipProps,
} from './components/Feedback';

export {
  SidebarItem,
  TopbarItem,
  Breadcrumb,
  Tabs,
  SegmentedControl,
  DropdownMenu,
  type SidebarItemProps,
  type TopbarItemProps,
  type BreadcrumbProps,
  type BreadcrumbItem,
  type TabsProps,
  type TabItem,
  type SegmentedControlProps,
  type DropdownMenuProps,
  type DropdownItem,
} from './components/Navigation';
