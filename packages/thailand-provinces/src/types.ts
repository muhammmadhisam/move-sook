export type ZipCode = {
  id: number;
  zip_code: number;
  tumbon_id: number;
};

export type Tambon = {
  id: number;
  zip_code: number;
  name_th: string;
  name_en: string;
  amphure_id: number;
};

export type Amphure = {
  id: number;
  name_th: string;
  name_en: string;
  province_id: number;
};

export type Province = {
  id: number;
  name_th: string;
  name_en: string;
  geography_id: number;
};

export type Left<E> = {
  readonly _tag: "Left";
  value: E;
};

export type Right<A> = {
  readonly _tag: "Right";
  value: A;
};

export type Either<E, A> = Left<E> | Right<A>;

export const left = <E, A = never>(err: E): Either<E, A> => ({
  _tag: "Left",
  value: err,
});

export const right = <A, E = never>(value: A): Either<E, A> => ({
  _tag: "Right",
  value: value,
});

export type None = {
  _tag: "None";
  value: undefined;
};
export type Some<A> = {
  _tag: "Some";
  value: A;
};
export type Option<A> = None | Some<A>;

export const none = (): None => ({ _tag: "None", value: undefined });
export const some = <A>(value: A): Some<A> => ({ _tag: "Some", value });

export const isNone = (x: Option<any>): x is None => x._tag === "None";
