// Site logo — /public/logo.png is the source-of-truth asset (only logo file
// we have; used for the header, favicon, and emails alike).
export default function LogoMark({ size = 44 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" width={size} height={size} alt="Pick and Pray" className="shrink-0" />
}
