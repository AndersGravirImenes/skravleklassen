/** Vignette + film grain under `.dune-screen::after` scanlines. */
export function CrtOverlay() {
  return (
    <>
      <div className="crt-vignette" aria-hidden />
      <div className="crt-grain pointer-events-none" aria-hidden />
    </>
  )
}
