import { brand } from '../config/brand'

export function BrandLogo({ decorative = false }: { decorative?: boolean }) {
  return <img
    src={brand.logo}
    alt={decorative ? '' : brand.name}
    width={480}
    height={120}
    className="h-auto w-36 max-w-full sm:w-44"
  />
}
