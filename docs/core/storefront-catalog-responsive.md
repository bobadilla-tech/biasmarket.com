# Storefront catalog responsive breakpoints

The storefront follows Tailwind's default breakpoints. The mobile layout is
the default through 767 px; the catalog changes to its desktop category panel
at `md` (768 px). Category cards switch from two columns to five at `lg`
(1024 px). Product cards use two columns by default, three at `sm` (640 px),
four at `lg` (1024 px), and five at `xl` (1280 px). Reference galleries use
two masonry columns by default, three at `md`, and four at `xl`.

The category chips are single-row, horizontally scrollable controls below
768 px and retain the desktop filter's multi-select behavior. Store tabs also
scroll within their own row, so they do not create page-level horizontal
overflow. After the full store profile scrolls out of view, the fixed utility
bar changes into a compact store identity bar with the store logo, name,
configured social links, cart, and sign-in link. It is limited to mobile and
respects reduced-motion preferences.

Responsive QA covers 360, 390, 430, 768, and 1024 px, including product,
category, and reference tabs and the search-filter-cart flow.
