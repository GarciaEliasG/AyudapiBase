export default function RootLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-blue-600 animate-pulse" />
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm" key={i}>
              <div className="h-3 w-1/3 bg-gray-200 rounded mb-3 animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 rounded mb-2 animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}