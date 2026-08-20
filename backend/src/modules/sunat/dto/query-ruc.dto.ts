import { IsRuc } from '../validators/is-ruc.validator';

/** Route param of GET /api/v1/tax/sunat/:ruc. */
export class QueryRucDto {
  @IsRuc()
  ruc!: string;
}
