import { IsArray, IsString } from 'class-validator';

export class ReorderStoreSectionsDto {
  @IsArray()
  @IsString({ each: true })
  sectionIds: string[];
}
