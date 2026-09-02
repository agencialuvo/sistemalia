import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

/** PATCH /inventory/products/:id — también cubre activar/desactivar
 *  (no hay endpoint de borrado: un producto con lotes o movimientos no debe
 *  poder eliminarse físicamente, la baja lógica vía `isActive` es la única
 *  vía, mismo criterio que Service/StaffMember). `isActive` ya llega opcional
 *  desde CreateProductDto — no hace falta redeclararlo aquí. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
