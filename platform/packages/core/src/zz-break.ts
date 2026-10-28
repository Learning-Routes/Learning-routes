export function breakIt(o: { a?: number }) {
  delete o.a;
  console.log(o);
}
