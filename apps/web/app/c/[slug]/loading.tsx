/** The card's shape while it loads, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <main className="min-h-[100dvh] bg-white sm:bg-[#f5f4f1] sm:px-4 sm:py-10" aria-busy="true">
      <div className="mx-auto w-full max-w-[440px] overflow-hidden bg-white sm:rounded-[20px] sm:shadow-[0_0_0_1px_#ecebe7]">
        <div className="h-[132px] animate-pulse bg-[#ecebe7]" />
        <div className="px-5 pb-10">
          <div className="-mt-11 h-[88px] w-[88px] rounded-full bg-[#e4e2dd] ring-4 ring-white" />
          <div className="mt-4 h-6 w-48 animate-pulse rounded-md bg-[#ecebe7]" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded-md bg-[#f1f0ec]" />
          <div className="mt-6 grid grid-cols-2 gap-2">
            <div className="h-12 animate-pulse rounded-[12px] bg-[#ecebe7]" />
            <div className="h-12 animate-pulse rounded-[12px] bg-[#f1f0ec]" />
          </div>
          <div className="mt-8 h-40 animate-pulse rounded-[14px] bg-[#f5f4f1]" />
        </div>
      </div>
    </main>
  );
}
