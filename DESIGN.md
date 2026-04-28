---
name: Video Education Assistant
colors:
  surface: '#fff7fb'
  surface-dim: '#e4d6e2'
  surface-bright: '#fff7fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#feeffc'
  surface-container: '#f8eaf6'
  surface-container-high: '#f2e4f1'
  surface-container-highest: '#eddeeb'
  on-surface: '#201922'
  on-surface-variant: '#504251'
  inverse-surface: '#362e37'
  inverse-on-surface: '#fbecf9'
  outline: '#827283'
  outline-variant: '#d4c1d3'
  surface-tint: '#9723ba'
  primary: '#680084'
  on-primary: '#ffffff'
  primary-container: '#8a0eae'
  on-primary-container: '#f2b2ff'
  inverse-primary: '#f1afff'
  secondary: '#7e4a8c'
  on-secondary: '#ffffff'
  secondary-container: '#f1b4fe'
  on-secondary-container: '#734081'
  tertiary: '#4e3900'
  on-tertiary: '#ffffff'
  tertiary-container: '#6b4f00'
  on-tertiary-container: '#eac36e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#fbd7ff'
  primary-fixed-dim: '#f1afff'
  on-primary-fixed: '#330043'
  on-primary-fixed-variant: '#780098'
  secondary-fixed: '#fbd7ff'
  secondary-fixed-dim: '#eeb1fb'
  on-secondary-fixed: '#330044'
  on-secondary-fixed-variant: '#643273'
  tertiary-fixed: '#ffdf9e'
  tertiary-fixed-dim: '#e9c16d'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5b4300'
  background: '#fff7fb'
  on-background: '#201922'
  surface-variant: '#eddeeb'
typography:
  h1:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  2xl: 3rem
  3xl: 4rem
  gutter: 1.5rem
  margin: 2rem
---

## Brand & Style

The brand personality of this design system is academic yet cutting-edge, designed to feel like a high-end personal tutor that is both unobtrusive and highly intelligent. The target audience includes educators, students, and corporate trainers who require a focused environment for video-based learning.

The chosen style is **Minimalism with a Modern Corporate influence**. It prioritizes extreme clarity and an expansive sense of "breathing room" to reduce cognitive load during study sessions. The interface relies on precise alignment, high-quality typography, and a sophisticated color palette to evoke a sense of professional reliability and technological focus.

## Colors

The color strategy for this design system utilizes a "Rich Professional" approach. The primary surface is grounded in a muted neutral-gray palette, providing a sophisticated alternative to pure white that reduces eye strain during long video sessions.

**Magenta (#b343d5)** serves as the functional primary color for actions and progress, offering a bold and distinct visual anchor. **Muted Purple (#9963a7)** is used for secondary brand moments and highlights. **Bronze-Gold (#6b4f00)** acts as the tertiary accent, specifically reserved for "AI-enhanced" feature states or high-value educational achievements. Typography and iconography primarily utilize deep neutral tones to maintain a crisp, legible hierarchy against the soft backgrounds.

## Typography

This design system exclusively employs **Inter** to leverage its exceptional legibility and systematic feel. The type scale is built on a tight melodic ratio to ensure that even complex educational data (like timestamps and transcripts) feels organized.

Headlines use a heavier weight and tighter letter spacing to create a sense of authority. Body text utilizes a generous line height (1.5 - 1.6) to ensure long-form educational content is easy to digest. Label styles are used for navigation and metadata, often employing a slightly heavier weight to distinguish them from instructional body copy.

## Layout & Spacing

This design system uses a **fixed-fluid hybrid grid**. The main content area utilizes a 12-column fluid grid for responsiveness, while the sidebar navigation remains fixed at 280px to provide a persistent anchor for the user.

Spacing is governed by a strict 4px baseline grid. Large "Macro-spacing" (3xl and 2xl) is prioritized between major sections to emphasize the minimalist aesthetic. Gutters are kept wide at 24px to ensure that cards and data visualizations never feel cramped, maintaining the high-end, professional feel required for an assistant-style interface.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layering combined with Ambient Shadows**. 

The base layer is the neutral surface background. Interactive containers and data cards sit on the "Level 1" elevation, featuring lighter container backgrounds and a very fine 1px border. These cards utilize an extra-diffused, low-opacity shadow (Shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05)) to appear as if they are gently floating. 

Popovers and modals occupy "Level 2," using a slightly more pronounced shadow and a backdrop blur of 8px on the layers beneath them to maintain focus on the active task.

## Shapes

The shape language of this design system is **Rounded (Level 2)**. This 8px (0.5rem) base radius provides a friendly, approachable feel while remaining professional and "app-like." 

Cards and major containers use the `rounded-lg` (1rem) setting to soften the overall layout. Interactive elements like buttons and input fields use the base 0.5rem radius to maintain a crisp, functional appearance. Fully rounded "pill" shapes are reserved exclusively for status tags and segmented control toggles to differentiate them from actionable buttons.

## Components

### Buttons
Primary buttons are solid Magenta-600 with white text, using a subtle inner glow for a tactile feel. Secondary buttons use a light neutral background with deep neutral text, appearing almost flat against the cards but clearly interactive.

### Sidebar Navigation
The sidebar is a minimalist vertical bar with a soft neutral background and a subtle right border. Nav items use a ghost style (transparent background) that transitions to a soft neutral-high on hover, with a Magenta vertical indicator appearing on the active state.

### Modern Input Fields
Inputs feature a clear background and a 1px neutral-variant border. Upon focus, the border transitions to Magenta-500 with a 3px soft Magenta outer ring (focus-ring). Labels are placed outside the field in the `label-md` style.

### Segmented Controls
These are designed as a "contained" group. A soft neutral background track houses "pills" that slide into place. The active segment is highly contrasted with a soft shadow, making it look physically elevated above the track.

### Data Cards
Data cards are the primary vessel for information. They feature 24px of internal padding and a 1px soft border. For video education, these cards include a "Video Thumbnail" slot at the top with a 0.5rem corner radius and a persistent Magenta "Progress Bar" at the bottom edge.

### Chips & Tags
Used for categories or video tags, these are small, low-contrast elements using neutral-container backgrounds and neutral-variant text to ensure they don't compete with primary actions.