import {
  IsOptional,
  IsString,
  Matches,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "allowedCategoryImageUrl", async: false })
class AllowedCategoryImageUrl implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== "string") return false;
    const publicUrl = process.env.S3_PUBLIC_URL;
    const bucket = process.env.S3_BUCKET;
    if (!publicUrl || !bucket) return false;
    try {
      const allowedBase = new URL(publicUrl);
      const imageUrl = new URL(value);
      const basePath = allowedBase.pathname.replace(/\/$/, "");
      return (
        (allowedBase.protocol === "https:" ||
          allowedBase.protocol === "http:") &&
        !allowedBase.username &&
        !allowedBase.password &&
        imageUrl.origin === allowedBase.origin &&
        !imageUrl.username &&
        !imageUrl.password &&
        !imageUrl.search &&
        !imageUrl.hash &&
        imageUrl.pathname.startsWith(`${basePath}/${bucket}/store-categories/`)
      );
    } catch {
      return false;
    }
  }

  defaultMessage() {
    return "imageUrl must be a category image URL from configured storage";
  }
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @Validate(AllowedCategoryImageUrl)
  imageUrl?: string | null;
}
