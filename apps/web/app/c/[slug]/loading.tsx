/**
 * The card's shape while it loads, so nothing jumps when it arrives. The card's
 * colours are not known yet, so it keeps to greys that sit in light and dark.
 */
export default function Loading() {
  return (
    <main className="min-h-[100dvh] bg-[#f5f4f1] sm:px-4 sm:py-10 [@media(prefers-color-scheme:dark)]:bg-[#0c0c0e]" aria-busy="true">
      <div className="mx-auto w-full max-w-[440px] overflow-hidden bg-[#8884]/10 sm:rounded-[20px]">
        <div className="h-[132px] animate-pulse bg-[#8882]" />
        <div className="px-5 pb-10">
          <div className="-mt-11 h-[88px] w-[88px] rounded-full bg-[#8883]" />
          <div className="mt-4 h-6 w-48 animate-pulse rounded-md bg-[#8882]" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded-md bg-[#8881]" />
          <div className="mt-6 grid grid-cols-2 gap-2">
            <div className="h-12 animate-pulse rounded-[12px] bg-[#8882]" />
            <div className="h-12 animate-pulse rounded-[12px] bg-[#8881]" />
          </div>
          <div className="mt-8 h-40 animate-pulse rounded-[14px] bg-[#8881]" />
        </div>
      </div>
    </main>
  );
}
