# Tarjeta de producto móvil

## Alcance

La cuadrícula del catálogo del vendedor usa `apps/web/features/products/components/product-tile.tsx`.
La página que la compone está en
`apps/web/app/[locale]/(dashboard)/dashboard/[slug]/products/products-page-client.tsx`.
La descripción del producto se adapta en
`apps/web/app/[locale]/(dashboard)/dashboard/[slug]/products/[productId]/product-detail-page-client.tsx`.

La vista Lista, el formulario de edición, el encabezado y los anchos de tablet y
escritorio quedan fuera de este rediseño.

## Decisiones visuales y de contenido

- En teléfono la cuadrícula tiene dos columnas y 12 px de separación. En
  `md` conserva dos columnas y en `xl` usa tres.
- La tarjeta ocupa el ancho de su columna; la imagen mide 150 px de alto. Si no
  hay imagen, la inicial del producto conserva ese espacio.
- Título y descripción se limitan a dos líneas. El detalle mantiene la
  descripción completa; solo las descripciones con formato de lista se separan
  en elementos. El texto corrido conserva su párrafo.
- Precio y stock comparten una fila; textos largos pueden ocupar más de una
  línea dentro de la tarjeta.
- En móvil Editar y Eliminar están en el menú de acciones. Los borradores
  conservan Publicar. La etiqueta de stock cero es «Agotado».
- El plural usa ICU: «1 unidad», «0 unidades» y «N unidades» en cuadrícula y
  lista.

## Revisión a 390 px

Con el contenedor de página (`px-5`), el ancho útil es 350 px. La cuadrícula se
extiende 4 px por lado con `-mx-1`, deja 358 px para el grid y, descontando los
12 px de separación, cada tarjeta mide 173 px. La imagen queda a 150 px; los
textos pueden reducirse o partirse sin ampliar la tarjeta porque las columnas,
tarjetas y bloques de texto usan `min-w-0` y las palabras largas pueden
partirse.

El botón de acciones usa `size-11` (44 × 44 px), las acciones del menú usan
`min-h-11` y Publicar también tiene al menos 44 px de alto.

### Contraste de texto sobre fondo blanco

Los colores de texto y chips de la tarjeta superan WCAG AA (4.5:1):

| Elemento          | Texto     | Contraste |
| ----------------- | --------- | --------: |
| Nombre            | `#2d1649` |   15.88:1 |
| Descripción       | `#665776` |    6.58:1 |
| Precio            | `#b4234d` |    6.39:1 |
| Stock bajo        | `#8a4b00` |    6.80:1 |
| Stock cero        | `#d11d52` |    5.24:1 |
| Stock disponible  | `#176b45` |    6.51:1 |
| Chip de categoría | `#39204f` |   14.06:1 |
| Estado publicado  | `#176b45` |    6.51:1 |
| Borrador          | `#554362` |    8.88:1 |

Disponibilidad usa `#176b45` (Disponible), `#8a4b00` (Agotado) o `#475569`
(Descontinuado), todos sobre chip blanco y con contraste superior a 4.5:1.

## Pruebas

- `product-tile.test.tsx` cubre el menú por teclado, sus acciones, la acción de
  publicar en borradores, el recorte de texto largo y las clases de contraste.
- `description-items.test.ts` cubre la separación de listas sin alterar
  descripciones en prosa.
- La revisión de 390 px anterior valida las dimensiones responsive desde los
  anchos y clases CSS del componente; no sustituye una comprobación en un
  dispositivo físico.
