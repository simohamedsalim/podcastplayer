export function PageTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="flex items-center justify-between px-4 pb-2 pt-5"><h1 className="text-2xl font-bold">{children}</h1>{right}</div>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-mute">{children}</p>;
}
