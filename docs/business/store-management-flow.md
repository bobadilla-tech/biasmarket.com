# Store Management Flow

Product/category/settings management from the seller dashboard. See
[`docs/core/product.md` §5.2](../core/product.md#52-product-management--crud-seller-panel)
for the full CRUD rules this follows (draft/publish gating, soft delete, variant
stock).

(Previous version listed a "Marca"/brand field, a banner image, a SKU field on
variants, and "Redes sociales" in settings — none of those exist in the schema.
Corrected below.)

```
Dashboard (/dashboard/:slug)
        │
   ┌────┼────────────┬──────────────┐
   ▼    ▼             ▼              ▼
Productos  Categorías   Colecciones   Configuración
   │
   ▼
Crear producto
   │
   ▼
Información básica
   • Nombre
   • Descripción
   • Precio base + moneda
   • Imágenes (hasta 5)
   │
   ▼
Crear variantes (opcional)
   • Nombre (versión, member, talla, etc.)
   • Stock (o ilimitado — null)
   • Precio override (opcional)
   • Imagen override (opcional)
   • Atributos libres (JSON)
   │
   ▼
Asignar categoría(s) / colección(es) (opcional)
   │
   ▼
Guardar como DRAFT o publicar directo
   │
   ▼
Si PUBLISHED → visible en /store/:slug


Editar productos
────────────────
Dashboard → Productos → Editar
   │
   ▼
Actualizar: precio, stock, fotos, descripción, variantes,
categoría/colección, mover entre DRAFT ↔ PUBLISHED,
marcar "sold out" manualmente
   │
   ▼
Guardar → cambios visibles inmediatamente
   │
   ▼
Eliminar: soft delete — un producto referenciado por
cualquier orden existente nunca se borra realmente
(sigue resolviéndose desde el historial de esa orden,
pero desaparece del storefront y de la lista por defecto)


Categorías / Colecciones
────────────────────────
Dashboard → Categorías → Crear categoría → asignar productos
                                          → visible en la tienda
Dashboard → Colecciones → Crear colección → asignar productos
                                           → usable en secciones
                                             del storefront


Configuración de la tienda
───────────────────────────
Dashboard → Configuración → Editar
   • Nombre de la tienda
   • Logo
   • Idioma de la tienda (ES/EN)
   • Moneda por defecto
   • WhatsApp (número de contacto — el checkout arma el mensaje
     wa.me para coordinar el pago; si no hay número, el comprador
     solo recibe las instrucciones de pago)
   • Instrucciones de pago
   • Métodos de pago habilitados + % de depósito
   • Métodos de entrega (recojo / courier) y puntos de recojo
   • Ventana de expiración de orden sin pagar (horas)
   • Umbral y alertas de stock bajo
   • Visibilidad en directorio/búsqueda global (Store.isPublic)
   │
   ▼
Guardar
```
