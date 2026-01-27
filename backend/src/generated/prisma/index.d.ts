
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Session
 * 
 */
export type Session = $Result.DefaultSelection<Prisma.$SessionPayload>
/**
 * Model Dialogue
 * 
 */
export type Dialogue = $Result.DefaultSelection<Prisma.$DialoguePayload>
/**
 * Model AudioFile
 * 
 */
export type AudioFile = $Result.DefaultSelection<Prisma.$AudioFilePayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Sessions
 * const sessions = await prisma.session.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Sessions
   * const sessions = await prisma.session.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.session`: Exposes CRUD operations for the **Session** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Sessions
    * const sessions = await prisma.session.findMany()
    * ```
    */
  get session(): Prisma.SessionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.dialogue`: Exposes CRUD operations for the **Dialogue** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Dialogues
    * const dialogues = await prisma.dialogue.findMany()
    * ```
    */
  get dialogue(): Prisma.DialogueDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.audioFile`: Exposes CRUD operations for the **AudioFile** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AudioFiles
    * const audioFiles = await prisma.audioFile.findMany()
    * ```
    */
  get audioFile(): Prisma.AudioFileDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.0
   * Query Engine version: 2ba551f319ab1df4bc874a89965d8b3641056773
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Session: 'Session',
    Dialogue: 'Dialogue',
    AudioFile: 'AudioFile'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "session" | "dialogue" | "audioFile"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Session: {
        payload: Prisma.$SessionPayload<ExtArgs>
        fields: Prisma.SessionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SessionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SessionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>
          }
          findFirst: {
            args: Prisma.SessionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SessionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>
          }
          findMany: {
            args: Prisma.SessionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>[]
          }
          create: {
            args: Prisma.SessionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>
          }
          createMany: {
            args: Prisma.SessionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SessionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>[]
          }
          delete: {
            args: Prisma.SessionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>
          }
          update: {
            args: Prisma.SessionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>
          }
          deleteMany: {
            args: Prisma.SessionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SessionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SessionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>[]
          }
          upsert: {
            args: Prisma.SessionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>
          }
          aggregate: {
            args: Prisma.SessionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSession>
          }
          groupBy: {
            args: Prisma.SessionGroupByArgs<ExtArgs>
            result: $Utils.Optional<SessionGroupByOutputType>[]
          }
          count: {
            args: Prisma.SessionCountArgs<ExtArgs>
            result: $Utils.Optional<SessionCountAggregateOutputType> | number
          }
        }
      }
      Dialogue: {
        payload: Prisma.$DialoguePayload<ExtArgs>
        fields: Prisma.DialogueFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DialogueFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DialogueFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>
          }
          findFirst: {
            args: Prisma.DialogueFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DialogueFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>
          }
          findMany: {
            args: Prisma.DialogueFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>[]
          }
          create: {
            args: Prisma.DialogueCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>
          }
          createMany: {
            args: Prisma.DialogueCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DialogueCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>[]
          }
          delete: {
            args: Prisma.DialogueDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>
          }
          update: {
            args: Prisma.DialogueUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>
          }
          deleteMany: {
            args: Prisma.DialogueDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DialogueUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DialogueUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>[]
          }
          upsert: {
            args: Prisma.DialogueUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DialoguePayload>
          }
          aggregate: {
            args: Prisma.DialogueAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDialogue>
          }
          groupBy: {
            args: Prisma.DialogueGroupByArgs<ExtArgs>
            result: $Utils.Optional<DialogueGroupByOutputType>[]
          }
          count: {
            args: Prisma.DialogueCountArgs<ExtArgs>
            result: $Utils.Optional<DialogueCountAggregateOutputType> | number
          }
        }
      }
      AudioFile: {
        payload: Prisma.$AudioFilePayload<ExtArgs>
        fields: Prisma.AudioFileFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AudioFileFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AudioFileFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>
          }
          findFirst: {
            args: Prisma.AudioFileFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AudioFileFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>
          }
          findMany: {
            args: Prisma.AudioFileFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>[]
          }
          create: {
            args: Prisma.AudioFileCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>
          }
          createMany: {
            args: Prisma.AudioFileCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AudioFileCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>[]
          }
          delete: {
            args: Prisma.AudioFileDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>
          }
          update: {
            args: Prisma.AudioFileUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>
          }
          deleteMany: {
            args: Prisma.AudioFileDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AudioFileUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AudioFileUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>[]
          }
          upsert: {
            args: Prisma.AudioFileUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AudioFilePayload>
          }
          aggregate: {
            args: Prisma.AudioFileAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAudioFile>
          }
          groupBy: {
            args: Prisma.AudioFileGroupByArgs<ExtArgs>
            result: $Utils.Optional<AudioFileGroupByOutputType>[]
          }
          count: {
            args: Prisma.AudioFileCountArgs<ExtArgs>
            result: $Utils.Optional<AudioFileCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    session?: SessionOmit
    dialogue?: DialogueOmit
    audioFile?: AudioFileOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type SessionCountOutputType
   */

  export type SessionCountOutputType = {
    dialogues: number
    audioFiles: number
  }

  export type SessionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    dialogues?: boolean | SessionCountOutputTypeCountDialoguesArgs
    audioFiles?: boolean | SessionCountOutputTypeCountAudioFilesArgs
  }

  // Custom InputTypes
  /**
   * SessionCountOutputType without action
   */
  export type SessionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SessionCountOutputType
     */
    select?: SessionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SessionCountOutputType without action
   */
  export type SessionCountOutputTypeCountDialoguesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DialogueWhereInput
  }

  /**
   * SessionCountOutputType without action
   */
  export type SessionCountOutputTypeCountAudioFilesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AudioFileWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Session
   */

  export type AggregateSession = {
    _count: SessionCountAggregateOutputType | null
    _avg: SessionAvgAggregateOutputType | null
    _sum: SessionSumAggregateOutputType | null
    _min: SessionMinAggregateOutputType | null
    _max: SessionMaxAggregateOutputType | null
  }

  export type SessionAvgAggregateOutputType = {
    exaggeration: number | null
    temperature: number | null
    seedNum: number | null
    cfgWeight: number | null
    minP: number | null
    topP: number | null
    repetitionPenalty: number | null
    totalDialogues: number | null
    audioFilesGenerated: number | null
  }

  export type SessionSumAggregateOutputType = {
    exaggeration: number | null
    temperature: number | null
    seedNum: number | null
    cfgWeight: number | null
    minP: number | null
    topP: number | null
    repetitionPenalty: number | null
    totalDialogues: number | null
    audioFilesGenerated: number | null
  }

  export type SessionMinAggregateOutputType = {
    id: string | null
    createdAt: Date | null
    updatedAt: Date | null
    name: string | null
    exaggeration: number | null
    temperature: number | null
    seedNum: number | null
    cfgWeight: number | null
    minP: number | null
    topP: number | null
    repetitionPenalty: number | null
    totalDialogues: number | null
    audioFilesGenerated: number | null
    allSuccessful: boolean | null
  }

  export type SessionMaxAggregateOutputType = {
    id: string | null
    createdAt: Date | null
    updatedAt: Date | null
    name: string | null
    exaggeration: number | null
    temperature: number | null
    seedNum: number | null
    cfgWeight: number | null
    minP: number | null
    topP: number | null
    repetitionPenalty: number | null
    totalDialogues: number | null
    audioFilesGenerated: number | null
    allSuccessful: boolean | null
  }

  export type SessionCountAggregateOutputType = {
    id: number
    createdAt: number
    updatedAt: number
    name: number
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues: number
    audioFilesGenerated: number
    allSuccessful: number
    _all: number
  }


  export type SessionAvgAggregateInputType = {
    exaggeration?: true
    temperature?: true
    seedNum?: true
    cfgWeight?: true
    minP?: true
    topP?: true
    repetitionPenalty?: true
    totalDialogues?: true
    audioFilesGenerated?: true
  }

  export type SessionSumAggregateInputType = {
    exaggeration?: true
    temperature?: true
    seedNum?: true
    cfgWeight?: true
    minP?: true
    topP?: true
    repetitionPenalty?: true
    totalDialogues?: true
    audioFilesGenerated?: true
  }

  export type SessionMinAggregateInputType = {
    id?: true
    createdAt?: true
    updatedAt?: true
    name?: true
    exaggeration?: true
    temperature?: true
    seedNum?: true
    cfgWeight?: true
    minP?: true
    topP?: true
    repetitionPenalty?: true
    totalDialogues?: true
    audioFilesGenerated?: true
    allSuccessful?: true
  }

  export type SessionMaxAggregateInputType = {
    id?: true
    createdAt?: true
    updatedAt?: true
    name?: true
    exaggeration?: true
    temperature?: true
    seedNum?: true
    cfgWeight?: true
    minP?: true
    topP?: true
    repetitionPenalty?: true
    totalDialogues?: true
    audioFilesGenerated?: true
    allSuccessful?: true
  }

  export type SessionCountAggregateInputType = {
    id?: true
    createdAt?: true
    updatedAt?: true
    name?: true
    exaggeration?: true
    temperature?: true
    seedNum?: true
    cfgWeight?: true
    minP?: true
    topP?: true
    repetitionPenalty?: true
    totalDialogues?: true
    audioFilesGenerated?: true
    allSuccessful?: true
    _all?: true
  }

  export type SessionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Session to aggregate.
     */
    where?: SessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Sessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Sessions
    **/
    _count?: true | SessionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SessionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SessionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SessionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SessionMaxAggregateInputType
  }

  export type GetSessionAggregateType<T extends SessionAggregateArgs> = {
        [P in keyof T & keyof AggregateSession]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSession[P]>
      : GetScalarType<T[P], AggregateSession[P]>
  }




  export type SessionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SessionWhereInput
    orderBy?: SessionOrderByWithAggregationInput | SessionOrderByWithAggregationInput[]
    by: SessionScalarFieldEnum[] | SessionScalarFieldEnum
    having?: SessionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SessionCountAggregateInputType | true
    _avg?: SessionAvgAggregateInputType
    _sum?: SessionSumAggregateInputType
    _min?: SessionMinAggregateInputType
    _max?: SessionMaxAggregateInputType
  }

  export type SessionGroupByOutputType = {
    id: string
    createdAt: Date
    updatedAt: Date
    name: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues: number
    audioFilesGenerated: number
    allSuccessful: boolean
    _count: SessionCountAggregateOutputType | null
    _avg: SessionAvgAggregateOutputType | null
    _sum: SessionSumAggregateOutputType | null
    _min: SessionMinAggregateOutputType | null
    _max: SessionMaxAggregateOutputType | null
  }

  type GetSessionGroupByPayload<T extends SessionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SessionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SessionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SessionGroupByOutputType[P]>
            : GetScalarType<T[P], SessionGroupByOutputType[P]>
        }
      >
    >


  export type SessionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    name?: boolean
    exaggeration?: boolean
    temperature?: boolean
    seedNum?: boolean
    cfgWeight?: boolean
    minP?: boolean
    topP?: boolean
    repetitionPenalty?: boolean
    totalDialogues?: boolean
    audioFilesGenerated?: boolean
    allSuccessful?: boolean
    dialogues?: boolean | Session$dialoguesArgs<ExtArgs>
    audioFiles?: boolean | Session$audioFilesArgs<ExtArgs>
    _count?: boolean | SessionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["session"]>

  export type SessionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    name?: boolean
    exaggeration?: boolean
    temperature?: boolean
    seedNum?: boolean
    cfgWeight?: boolean
    minP?: boolean
    topP?: boolean
    repetitionPenalty?: boolean
    totalDialogues?: boolean
    audioFilesGenerated?: boolean
    allSuccessful?: boolean
  }, ExtArgs["result"]["session"]>

  export type SessionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    name?: boolean
    exaggeration?: boolean
    temperature?: boolean
    seedNum?: boolean
    cfgWeight?: boolean
    minP?: boolean
    topP?: boolean
    repetitionPenalty?: boolean
    totalDialogues?: boolean
    audioFilesGenerated?: boolean
    allSuccessful?: boolean
  }, ExtArgs["result"]["session"]>

  export type SessionSelectScalar = {
    id?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    name?: boolean
    exaggeration?: boolean
    temperature?: boolean
    seedNum?: boolean
    cfgWeight?: boolean
    minP?: boolean
    topP?: boolean
    repetitionPenalty?: boolean
    totalDialogues?: boolean
    audioFilesGenerated?: boolean
    allSuccessful?: boolean
  }

  export type SessionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "createdAt" | "updatedAt" | "name" | "exaggeration" | "temperature" | "seedNum" | "cfgWeight" | "minP" | "topP" | "repetitionPenalty" | "totalDialogues" | "audioFilesGenerated" | "allSuccessful", ExtArgs["result"]["session"]>
  export type SessionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    dialogues?: boolean | Session$dialoguesArgs<ExtArgs>
    audioFiles?: boolean | Session$audioFilesArgs<ExtArgs>
    _count?: boolean | SessionCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SessionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SessionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SessionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Session"
    objects: {
      dialogues: Prisma.$DialoguePayload<ExtArgs>[]
      audioFiles: Prisma.$AudioFilePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      createdAt: Date
      updatedAt: Date
      name: string | null
      exaggeration: number
      temperature: number
      seedNum: number
      cfgWeight: number
      minP: number
      topP: number
      repetitionPenalty: number
      totalDialogues: number
      audioFilesGenerated: number
      allSuccessful: boolean
    }, ExtArgs["result"]["session"]>
    composites: {}
  }

  type SessionGetPayload<S extends boolean | null | undefined | SessionDefaultArgs> = $Result.GetResult<Prisma.$SessionPayload, S>

  type SessionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SessionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SessionCountAggregateInputType | true
    }

  export interface SessionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Session'], meta: { name: 'Session' } }
    /**
     * Find zero or one Session that matches the filter.
     * @param {SessionFindUniqueArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SessionFindUniqueArgs>(args: SelectSubset<T, SessionFindUniqueArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Session that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SessionFindUniqueOrThrowArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SessionFindUniqueOrThrowArgs>(args: SelectSubset<T, SessionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Session that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionFindFirstArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SessionFindFirstArgs>(args?: SelectSubset<T, SessionFindFirstArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Session that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionFindFirstOrThrowArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SessionFindFirstOrThrowArgs>(args?: SelectSubset<T, SessionFindFirstOrThrowArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Sessions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Sessions
     * const sessions = await prisma.session.findMany()
     * 
     * // Get first 10 Sessions
     * const sessions = await prisma.session.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const sessionWithIdOnly = await prisma.session.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SessionFindManyArgs>(args?: SelectSubset<T, SessionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Session.
     * @param {SessionCreateArgs} args - Arguments to create a Session.
     * @example
     * // Create one Session
     * const Session = await prisma.session.create({
     *   data: {
     *     // ... data to create a Session
     *   }
     * })
     * 
     */
    create<T extends SessionCreateArgs>(args: SelectSubset<T, SessionCreateArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Sessions.
     * @param {SessionCreateManyArgs} args - Arguments to create many Sessions.
     * @example
     * // Create many Sessions
     * const session = await prisma.session.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SessionCreateManyArgs>(args?: SelectSubset<T, SessionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Sessions and returns the data saved in the database.
     * @param {SessionCreateManyAndReturnArgs} args - Arguments to create many Sessions.
     * @example
     * // Create many Sessions
     * const session = await prisma.session.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Sessions and only return the `id`
     * const sessionWithIdOnly = await prisma.session.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SessionCreateManyAndReturnArgs>(args?: SelectSubset<T, SessionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Session.
     * @param {SessionDeleteArgs} args - Arguments to delete one Session.
     * @example
     * // Delete one Session
     * const Session = await prisma.session.delete({
     *   where: {
     *     // ... filter to delete one Session
     *   }
     * })
     * 
     */
    delete<T extends SessionDeleteArgs>(args: SelectSubset<T, SessionDeleteArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Session.
     * @param {SessionUpdateArgs} args - Arguments to update one Session.
     * @example
     * // Update one Session
     * const session = await prisma.session.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SessionUpdateArgs>(args: SelectSubset<T, SessionUpdateArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Sessions.
     * @param {SessionDeleteManyArgs} args - Arguments to filter Sessions to delete.
     * @example
     * // Delete a few Sessions
     * const { count } = await prisma.session.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SessionDeleteManyArgs>(args?: SelectSubset<T, SessionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Sessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Sessions
     * const session = await prisma.session.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SessionUpdateManyArgs>(args: SelectSubset<T, SessionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Sessions and returns the data updated in the database.
     * @param {SessionUpdateManyAndReturnArgs} args - Arguments to update many Sessions.
     * @example
     * // Update many Sessions
     * const session = await prisma.session.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Sessions and only return the `id`
     * const sessionWithIdOnly = await prisma.session.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SessionUpdateManyAndReturnArgs>(args: SelectSubset<T, SessionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Session.
     * @param {SessionUpsertArgs} args - Arguments to update or create a Session.
     * @example
     * // Update or create a Session
     * const session = await prisma.session.upsert({
     *   create: {
     *     // ... data to create a Session
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Session we want to update
     *   }
     * })
     */
    upsert<T extends SessionUpsertArgs>(args: SelectSubset<T, SessionUpsertArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Sessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionCountArgs} args - Arguments to filter Sessions to count.
     * @example
     * // Count the number of Sessions
     * const count = await prisma.session.count({
     *   where: {
     *     // ... the filter for the Sessions we want to count
     *   }
     * })
    **/
    count<T extends SessionCountArgs>(
      args?: Subset<T, SessionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SessionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Session.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SessionAggregateArgs>(args: Subset<T, SessionAggregateArgs>): Prisma.PrismaPromise<GetSessionAggregateType<T>>

    /**
     * Group by Session.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SessionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SessionGroupByArgs['orderBy'] }
        : { orderBy?: SessionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SessionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSessionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Session model
   */
  readonly fields: SessionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Session.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SessionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    dialogues<T extends Session$dialoguesArgs<ExtArgs> = {}>(args?: Subset<T, Session$dialoguesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    audioFiles<T extends Session$audioFilesArgs<ExtArgs> = {}>(args?: Subset<T, Session$audioFilesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Session model
   */
  interface SessionFieldRefs {
    readonly id: FieldRef<"Session", 'String'>
    readonly createdAt: FieldRef<"Session", 'DateTime'>
    readonly updatedAt: FieldRef<"Session", 'DateTime'>
    readonly name: FieldRef<"Session", 'String'>
    readonly exaggeration: FieldRef<"Session", 'Float'>
    readonly temperature: FieldRef<"Session", 'Float'>
    readonly seedNum: FieldRef<"Session", 'Int'>
    readonly cfgWeight: FieldRef<"Session", 'Float'>
    readonly minP: FieldRef<"Session", 'Float'>
    readonly topP: FieldRef<"Session", 'Float'>
    readonly repetitionPenalty: FieldRef<"Session", 'Float'>
    readonly totalDialogues: FieldRef<"Session", 'Int'>
    readonly audioFilesGenerated: FieldRef<"Session", 'Int'>
    readonly allSuccessful: FieldRef<"Session", 'Boolean'>
  }
    

  // Custom InputTypes
  /**
   * Session findUnique
   */
  export type SessionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * Filter, which Session to fetch.
     */
    where: SessionWhereUniqueInput
  }

  /**
   * Session findUniqueOrThrow
   */
  export type SessionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * Filter, which Session to fetch.
     */
    where: SessionWhereUniqueInput
  }

  /**
   * Session findFirst
   */
  export type SessionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * Filter, which Session to fetch.
     */
    where?: SessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Sessions.
     */
    cursor?: SessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Sessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Sessions.
     */
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[]
  }

  /**
   * Session findFirstOrThrow
   */
  export type SessionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * Filter, which Session to fetch.
     */
    where?: SessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Sessions.
     */
    cursor?: SessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Sessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Sessions.
     */
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[]
  }

  /**
   * Session findMany
   */
  export type SessionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * Filter, which Sessions to fetch.
     */
    where?: SessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Sessions.
     */
    cursor?: SessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Sessions.
     */
    skip?: number
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[]
  }

  /**
   * Session create
   */
  export type SessionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * The data needed to create a Session.
     */
    data: XOR<SessionCreateInput, SessionUncheckedCreateInput>
  }

  /**
   * Session createMany
   */
  export type SessionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Sessions.
     */
    data: SessionCreateManyInput | SessionCreateManyInput[]
  }

  /**
   * Session createManyAndReturn
   */
  export type SessionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * The data used to create many Sessions.
     */
    data: SessionCreateManyInput | SessionCreateManyInput[]
  }

  /**
   * Session update
   */
  export type SessionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * The data needed to update a Session.
     */
    data: XOR<SessionUpdateInput, SessionUncheckedUpdateInput>
    /**
     * Choose, which Session to update.
     */
    where: SessionWhereUniqueInput
  }

  /**
   * Session updateMany
   */
  export type SessionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Sessions.
     */
    data: XOR<SessionUpdateManyMutationInput, SessionUncheckedUpdateManyInput>
    /**
     * Filter which Sessions to update
     */
    where?: SessionWhereInput
    /**
     * Limit how many Sessions to update.
     */
    limit?: number
  }

  /**
   * Session updateManyAndReturn
   */
  export type SessionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * The data used to update Sessions.
     */
    data: XOR<SessionUpdateManyMutationInput, SessionUncheckedUpdateManyInput>
    /**
     * Filter which Sessions to update
     */
    where?: SessionWhereInput
    /**
     * Limit how many Sessions to update.
     */
    limit?: number
  }

  /**
   * Session upsert
   */
  export type SessionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * The filter to search for the Session to update in case it exists.
     */
    where: SessionWhereUniqueInput
    /**
     * In case the Session found by the `where` argument doesn't exist, create a new Session with this data.
     */
    create: XOR<SessionCreateInput, SessionUncheckedCreateInput>
    /**
     * In case the Session was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SessionUpdateInput, SessionUncheckedUpdateInput>
  }

  /**
   * Session delete
   */
  export type SessionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
    /**
     * Filter which Session to delete.
     */
    where: SessionWhereUniqueInput
  }

  /**
   * Session deleteMany
   */
  export type SessionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Sessions to delete
     */
    where?: SessionWhereInput
    /**
     * Limit how many Sessions to delete.
     */
    limit?: number
  }

  /**
   * Session.dialogues
   */
  export type Session$dialoguesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    where?: DialogueWhereInput
    orderBy?: DialogueOrderByWithRelationInput | DialogueOrderByWithRelationInput[]
    cursor?: DialogueWhereUniqueInput
    take?: number
    skip?: number
    distinct?: DialogueScalarFieldEnum | DialogueScalarFieldEnum[]
  }

  /**
   * Session.audioFiles
   */
  export type Session$audioFilesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    where?: AudioFileWhereInput
    orderBy?: AudioFileOrderByWithRelationInput | AudioFileOrderByWithRelationInput[]
    cursor?: AudioFileWhereUniqueInput
    take?: number
    skip?: number
    distinct?: AudioFileScalarFieldEnum | AudioFileScalarFieldEnum[]
  }

  /**
   * Session without action
   */
  export type SessionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null
  }


  /**
   * Model Dialogue
   */

  export type AggregateDialogue = {
    _count: DialogueCountAggregateOutputType | null
    _avg: DialogueAvgAggregateOutputType | null
    _sum: DialogueSumAggregateOutputType | null
    _min: DialogueMinAggregateOutputType | null
    _max: DialogueMaxAggregateOutputType | null
  }

  export type DialogueAvgAggregateOutputType = {
    order: number | null
  }

  export type DialogueSumAggregateOutputType = {
    order: number | null
  }

  export type DialogueMinAggregateOutputType = {
    id: string | null
    sessionId: string | null
    text: string | null
    character: string | null
    order: number | null
    createdAt: Date | null
  }

  export type DialogueMaxAggregateOutputType = {
    id: string | null
    sessionId: string | null
    text: string | null
    character: string | null
    order: number | null
    createdAt: Date | null
  }

  export type DialogueCountAggregateOutputType = {
    id: number
    sessionId: number
    text: number
    character: number
    order: number
    createdAt: number
    _all: number
  }


  export type DialogueAvgAggregateInputType = {
    order?: true
  }

  export type DialogueSumAggregateInputType = {
    order?: true
  }

  export type DialogueMinAggregateInputType = {
    id?: true
    sessionId?: true
    text?: true
    character?: true
    order?: true
    createdAt?: true
  }

  export type DialogueMaxAggregateInputType = {
    id?: true
    sessionId?: true
    text?: true
    character?: true
    order?: true
    createdAt?: true
  }

  export type DialogueCountAggregateInputType = {
    id?: true
    sessionId?: true
    text?: true
    character?: true
    order?: true
    createdAt?: true
    _all?: true
  }

  export type DialogueAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Dialogue to aggregate.
     */
    where?: DialogueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Dialogues to fetch.
     */
    orderBy?: DialogueOrderByWithRelationInput | DialogueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DialogueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Dialogues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Dialogues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Dialogues
    **/
    _count?: true | DialogueCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DialogueAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DialogueSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DialogueMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DialogueMaxAggregateInputType
  }

  export type GetDialogueAggregateType<T extends DialogueAggregateArgs> = {
        [P in keyof T & keyof AggregateDialogue]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDialogue[P]>
      : GetScalarType<T[P], AggregateDialogue[P]>
  }




  export type DialogueGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DialogueWhereInput
    orderBy?: DialogueOrderByWithAggregationInput | DialogueOrderByWithAggregationInput[]
    by: DialogueScalarFieldEnum[] | DialogueScalarFieldEnum
    having?: DialogueScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DialogueCountAggregateInputType | true
    _avg?: DialogueAvgAggregateInputType
    _sum?: DialogueSumAggregateInputType
    _min?: DialogueMinAggregateInputType
    _max?: DialogueMaxAggregateInputType
  }

  export type DialogueGroupByOutputType = {
    id: string
    sessionId: string
    text: string
    character: string
    order: number
    createdAt: Date
    _count: DialogueCountAggregateOutputType | null
    _avg: DialogueAvgAggregateOutputType | null
    _sum: DialogueSumAggregateOutputType | null
    _min: DialogueMinAggregateOutputType | null
    _max: DialogueMaxAggregateOutputType | null
  }

  type GetDialogueGroupByPayload<T extends DialogueGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DialogueGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DialogueGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DialogueGroupByOutputType[P]>
            : GetScalarType<T[P], DialogueGroupByOutputType[P]>
        }
      >
    >


  export type DialogueSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    text?: boolean
    character?: boolean
    order?: boolean
    createdAt?: boolean
    session?: boolean | SessionDefaultArgs<ExtArgs>
    audioFile?: boolean | Dialogue$audioFileArgs<ExtArgs>
  }, ExtArgs["result"]["dialogue"]>

  export type DialogueSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    text?: boolean
    character?: boolean
    order?: boolean
    createdAt?: boolean
    session?: boolean | SessionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["dialogue"]>

  export type DialogueSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    text?: boolean
    character?: boolean
    order?: boolean
    createdAt?: boolean
    session?: boolean | SessionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["dialogue"]>

  export type DialogueSelectScalar = {
    id?: boolean
    sessionId?: boolean
    text?: boolean
    character?: boolean
    order?: boolean
    createdAt?: boolean
  }

  export type DialogueOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "sessionId" | "text" | "character" | "order" | "createdAt", ExtArgs["result"]["dialogue"]>
  export type DialogueInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    session?: boolean | SessionDefaultArgs<ExtArgs>
    audioFile?: boolean | Dialogue$audioFileArgs<ExtArgs>
  }
  export type DialogueIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    session?: boolean | SessionDefaultArgs<ExtArgs>
  }
  export type DialogueIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    session?: boolean | SessionDefaultArgs<ExtArgs>
  }

  export type $DialoguePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Dialogue"
    objects: {
      session: Prisma.$SessionPayload<ExtArgs>
      audioFile: Prisma.$AudioFilePayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      sessionId: string
      text: string
      character: string
      order: number
      createdAt: Date
    }, ExtArgs["result"]["dialogue"]>
    composites: {}
  }

  type DialogueGetPayload<S extends boolean | null | undefined | DialogueDefaultArgs> = $Result.GetResult<Prisma.$DialoguePayload, S>

  type DialogueCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DialogueFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DialogueCountAggregateInputType | true
    }

  export interface DialogueDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Dialogue'], meta: { name: 'Dialogue' } }
    /**
     * Find zero or one Dialogue that matches the filter.
     * @param {DialogueFindUniqueArgs} args - Arguments to find a Dialogue
     * @example
     * // Get one Dialogue
     * const dialogue = await prisma.dialogue.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DialogueFindUniqueArgs>(args: SelectSubset<T, DialogueFindUniqueArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Dialogue that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DialogueFindUniqueOrThrowArgs} args - Arguments to find a Dialogue
     * @example
     * // Get one Dialogue
     * const dialogue = await prisma.dialogue.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DialogueFindUniqueOrThrowArgs>(args: SelectSubset<T, DialogueFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Dialogue that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueFindFirstArgs} args - Arguments to find a Dialogue
     * @example
     * // Get one Dialogue
     * const dialogue = await prisma.dialogue.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DialogueFindFirstArgs>(args?: SelectSubset<T, DialogueFindFirstArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Dialogue that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueFindFirstOrThrowArgs} args - Arguments to find a Dialogue
     * @example
     * // Get one Dialogue
     * const dialogue = await prisma.dialogue.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DialogueFindFirstOrThrowArgs>(args?: SelectSubset<T, DialogueFindFirstOrThrowArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Dialogues that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Dialogues
     * const dialogues = await prisma.dialogue.findMany()
     * 
     * // Get first 10 Dialogues
     * const dialogues = await prisma.dialogue.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const dialogueWithIdOnly = await prisma.dialogue.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DialogueFindManyArgs>(args?: SelectSubset<T, DialogueFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Dialogue.
     * @param {DialogueCreateArgs} args - Arguments to create a Dialogue.
     * @example
     * // Create one Dialogue
     * const Dialogue = await prisma.dialogue.create({
     *   data: {
     *     // ... data to create a Dialogue
     *   }
     * })
     * 
     */
    create<T extends DialogueCreateArgs>(args: SelectSubset<T, DialogueCreateArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Dialogues.
     * @param {DialogueCreateManyArgs} args - Arguments to create many Dialogues.
     * @example
     * // Create many Dialogues
     * const dialogue = await prisma.dialogue.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DialogueCreateManyArgs>(args?: SelectSubset<T, DialogueCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Dialogues and returns the data saved in the database.
     * @param {DialogueCreateManyAndReturnArgs} args - Arguments to create many Dialogues.
     * @example
     * // Create many Dialogues
     * const dialogue = await prisma.dialogue.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Dialogues and only return the `id`
     * const dialogueWithIdOnly = await prisma.dialogue.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DialogueCreateManyAndReturnArgs>(args?: SelectSubset<T, DialogueCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Dialogue.
     * @param {DialogueDeleteArgs} args - Arguments to delete one Dialogue.
     * @example
     * // Delete one Dialogue
     * const Dialogue = await prisma.dialogue.delete({
     *   where: {
     *     // ... filter to delete one Dialogue
     *   }
     * })
     * 
     */
    delete<T extends DialogueDeleteArgs>(args: SelectSubset<T, DialogueDeleteArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Dialogue.
     * @param {DialogueUpdateArgs} args - Arguments to update one Dialogue.
     * @example
     * // Update one Dialogue
     * const dialogue = await prisma.dialogue.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DialogueUpdateArgs>(args: SelectSubset<T, DialogueUpdateArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Dialogues.
     * @param {DialogueDeleteManyArgs} args - Arguments to filter Dialogues to delete.
     * @example
     * // Delete a few Dialogues
     * const { count } = await prisma.dialogue.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DialogueDeleteManyArgs>(args?: SelectSubset<T, DialogueDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Dialogues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Dialogues
     * const dialogue = await prisma.dialogue.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DialogueUpdateManyArgs>(args: SelectSubset<T, DialogueUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Dialogues and returns the data updated in the database.
     * @param {DialogueUpdateManyAndReturnArgs} args - Arguments to update many Dialogues.
     * @example
     * // Update many Dialogues
     * const dialogue = await prisma.dialogue.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Dialogues and only return the `id`
     * const dialogueWithIdOnly = await prisma.dialogue.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DialogueUpdateManyAndReturnArgs>(args: SelectSubset<T, DialogueUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Dialogue.
     * @param {DialogueUpsertArgs} args - Arguments to update or create a Dialogue.
     * @example
     * // Update or create a Dialogue
     * const dialogue = await prisma.dialogue.upsert({
     *   create: {
     *     // ... data to create a Dialogue
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Dialogue we want to update
     *   }
     * })
     */
    upsert<T extends DialogueUpsertArgs>(args: SelectSubset<T, DialogueUpsertArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Dialogues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueCountArgs} args - Arguments to filter Dialogues to count.
     * @example
     * // Count the number of Dialogues
     * const count = await prisma.dialogue.count({
     *   where: {
     *     // ... the filter for the Dialogues we want to count
     *   }
     * })
    **/
    count<T extends DialogueCountArgs>(
      args?: Subset<T, DialogueCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DialogueCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Dialogue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DialogueAggregateArgs>(args: Subset<T, DialogueAggregateArgs>): Prisma.PrismaPromise<GetDialogueAggregateType<T>>

    /**
     * Group by Dialogue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DialogueGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DialogueGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DialogueGroupByArgs['orderBy'] }
        : { orderBy?: DialogueGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DialogueGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDialogueGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Dialogue model
   */
  readonly fields: DialogueFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Dialogue.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DialogueClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    session<T extends SessionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SessionDefaultArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    audioFile<T extends Dialogue$audioFileArgs<ExtArgs> = {}>(args?: Subset<T, Dialogue$audioFileArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Dialogue model
   */
  interface DialogueFieldRefs {
    readonly id: FieldRef<"Dialogue", 'String'>
    readonly sessionId: FieldRef<"Dialogue", 'String'>
    readonly text: FieldRef<"Dialogue", 'String'>
    readonly character: FieldRef<"Dialogue", 'String'>
    readonly order: FieldRef<"Dialogue", 'Int'>
    readonly createdAt: FieldRef<"Dialogue", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Dialogue findUnique
   */
  export type DialogueFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * Filter, which Dialogue to fetch.
     */
    where: DialogueWhereUniqueInput
  }

  /**
   * Dialogue findUniqueOrThrow
   */
  export type DialogueFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * Filter, which Dialogue to fetch.
     */
    where: DialogueWhereUniqueInput
  }

  /**
   * Dialogue findFirst
   */
  export type DialogueFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * Filter, which Dialogue to fetch.
     */
    where?: DialogueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Dialogues to fetch.
     */
    orderBy?: DialogueOrderByWithRelationInput | DialogueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Dialogues.
     */
    cursor?: DialogueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Dialogues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Dialogues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Dialogues.
     */
    distinct?: DialogueScalarFieldEnum | DialogueScalarFieldEnum[]
  }

  /**
   * Dialogue findFirstOrThrow
   */
  export type DialogueFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * Filter, which Dialogue to fetch.
     */
    where?: DialogueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Dialogues to fetch.
     */
    orderBy?: DialogueOrderByWithRelationInput | DialogueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Dialogues.
     */
    cursor?: DialogueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Dialogues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Dialogues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Dialogues.
     */
    distinct?: DialogueScalarFieldEnum | DialogueScalarFieldEnum[]
  }

  /**
   * Dialogue findMany
   */
  export type DialogueFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * Filter, which Dialogues to fetch.
     */
    where?: DialogueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Dialogues to fetch.
     */
    orderBy?: DialogueOrderByWithRelationInput | DialogueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Dialogues.
     */
    cursor?: DialogueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Dialogues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Dialogues.
     */
    skip?: number
    distinct?: DialogueScalarFieldEnum | DialogueScalarFieldEnum[]
  }

  /**
   * Dialogue create
   */
  export type DialogueCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * The data needed to create a Dialogue.
     */
    data: XOR<DialogueCreateInput, DialogueUncheckedCreateInput>
  }

  /**
   * Dialogue createMany
   */
  export type DialogueCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Dialogues.
     */
    data: DialogueCreateManyInput | DialogueCreateManyInput[]
  }

  /**
   * Dialogue createManyAndReturn
   */
  export type DialogueCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * The data used to create many Dialogues.
     */
    data: DialogueCreateManyInput | DialogueCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Dialogue update
   */
  export type DialogueUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * The data needed to update a Dialogue.
     */
    data: XOR<DialogueUpdateInput, DialogueUncheckedUpdateInput>
    /**
     * Choose, which Dialogue to update.
     */
    where: DialogueWhereUniqueInput
  }

  /**
   * Dialogue updateMany
   */
  export type DialogueUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Dialogues.
     */
    data: XOR<DialogueUpdateManyMutationInput, DialogueUncheckedUpdateManyInput>
    /**
     * Filter which Dialogues to update
     */
    where?: DialogueWhereInput
    /**
     * Limit how many Dialogues to update.
     */
    limit?: number
  }

  /**
   * Dialogue updateManyAndReturn
   */
  export type DialogueUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * The data used to update Dialogues.
     */
    data: XOR<DialogueUpdateManyMutationInput, DialogueUncheckedUpdateManyInput>
    /**
     * Filter which Dialogues to update
     */
    where?: DialogueWhereInput
    /**
     * Limit how many Dialogues to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Dialogue upsert
   */
  export type DialogueUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * The filter to search for the Dialogue to update in case it exists.
     */
    where: DialogueWhereUniqueInput
    /**
     * In case the Dialogue found by the `where` argument doesn't exist, create a new Dialogue with this data.
     */
    create: XOR<DialogueCreateInput, DialogueUncheckedCreateInput>
    /**
     * In case the Dialogue was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DialogueUpdateInput, DialogueUncheckedUpdateInput>
  }

  /**
   * Dialogue delete
   */
  export type DialogueDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    /**
     * Filter which Dialogue to delete.
     */
    where: DialogueWhereUniqueInput
  }

  /**
   * Dialogue deleteMany
   */
  export type DialogueDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Dialogues to delete
     */
    where?: DialogueWhereInput
    /**
     * Limit how many Dialogues to delete.
     */
    limit?: number
  }

  /**
   * Dialogue.audioFile
   */
  export type Dialogue$audioFileArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    where?: AudioFileWhereInput
  }

  /**
   * Dialogue without action
   */
  export type DialogueDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
  }


  /**
   * Model AudioFile
   */

  export type AggregateAudioFile = {
    _count: AudioFileCountAggregateOutputType | null
    _avg: AudioFileAvgAggregateOutputType | null
    _sum: AudioFileSumAggregateOutputType | null
    _min: AudioFileMinAggregateOutputType | null
    _max: AudioFileMaxAggregateOutputType | null
  }

  export type AudioFileAvgAggregateOutputType = {
    fileSize: number | null
    duration: number | null
  }

  export type AudioFileSumAggregateOutputType = {
    fileSize: number | null
    duration: number | null
  }

  export type AudioFileMinAggregateOutputType = {
    id: string | null
    sessionId: string | null
    dialogueId: string | null
    filename: string | null
    filePath: string | null
    fileSize: number | null
    duration: number | null
    generatedAt: Date | null
    success: boolean | null
    errorMessage: string | null
  }

  export type AudioFileMaxAggregateOutputType = {
    id: string | null
    sessionId: string | null
    dialogueId: string | null
    filename: string | null
    filePath: string | null
    fileSize: number | null
    duration: number | null
    generatedAt: Date | null
    success: boolean | null
    errorMessage: string | null
  }

  export type AudioFileCountAggregateOutputType = {
    id: number
    sessionId: number
    dialogueId: number
    filename: number
    filePath: number
    fileSize: number
    duration: number
    generatedAt: number
    success: number
    errorMessage: number
    _all: number
  }


  export type AudioFileAvgAggregateInputType = {
    fileSize?: true
    duration?: true
  }

  export type AudioFileSumAggregateInputType = {
    fileSize?: true
    duration?: true
  }

  export type AudioFileMinAggregateInputType = {
    id?: true
    sessionId?: true
    dialogueId?: true
    filename?: true
    filePath?: true
    fileSize?: true
    duration?: true
    generatedAt?: true
    success?: true
    errorMessage?: true
  }

  export type AudioFileMaxAggregateInputType = {
    id?: true
    sessionId?: true
    dialogueId?: true
    filename?: true
    filePath?: true
    fileSize?: true
    duration?: true
    generatedAt?: true
    success?: true
    errorMessage?: true
  }

  export type AudioFileCountAggregateInputType = {
    id?: true
    sessionId?: true
    dialogueId?: true
    filename?: true
    filePath?: true
    fileSize?: true
    duration?: true
    generatedAt?: true
    success?: true
    errorMessage?: true
    _all?: true
  }

  export type AudioFileAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AudioFile to aggregate.
     */
    where?: AudioFileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AudioFiles to fetch.
     */
    orderBy?: AudioFileOrderByWithRelationInput | AudioFileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AudioFileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AudioFiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AudioFiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AudioFiles
    **/
    _count?: true | AudioFileCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: AudioFileAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: AudioFileSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AudioFileMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AudioFileMaxAggregateInputType
  }

  export type GetAudioFileAggregateType<T extends AudioFileAggregateArgs> = {
        [P in keyof T & keyof AggregateAudioFile]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAudioFile[P]>
      : GetScalarType<T[P], AggregateAudioFile[P]>
  }




  export type AudioFileGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AudioFileWhereInput
    orderBy?: AudioFileOrderByWithAggregationInput | AudioFileOrderByWithAggregationInput[]
    by: AudioFileScalarFieldEnum[] | AudioFileScalarFieldEnum
    having?: AudioFileScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AudioFileCountAggregateInputType | true
    _avg?: AudioFileAvgAggregateInputType
    _sum?: AudioFileSumAggregateInputType
    _min?: AudioFileMinAggregateInputType
    _max?: AudioFileMaxAggregateInputType
  }

  export type AudioFileGroupByOutputType = {
    id: string
    sessionId: string
    dialogueId: string | null
    filename: string
    filePath: string
    fileSize: number | null
    duration: number | null
    generatedAt: Date
    success: boolean
    errorMessage: string | null
    _count: AudioFileCountAggregateOutputType | null
    _avg: AudioFileAvgAggregateOutputType | null
    _sum: AudioFileSumAggregateOutputType | null
    _min: AudioFileMinAggregateOutputType | null
    _max: AudioFileMaxAggregateOutputType | null
  }

  type GetAudioFileGroupByPayload<T extends AudioFileGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AudioFileGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AudioFileGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AudioFileGroupByOutputType[P]>
            : GetScalarType<T[P], AudioFileGroupByOutputType[P]>
        }
      >
    >


  export type AudioFileSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    dialogueId?: boolean
    filename?: boolean
    filePath?: boolean
    fileSize?: boolean
    duration?: boolean
    generatedAt?: boolean
    success?: boolean
    errorMessage?: boolean
    session?: boolean | SessionDefaultArgs<ExtArgs>
    dialogue?: boolean | AudioFile$dialogueArgs<ExtArgs>
  }, ExtArgs["result"]["audioFile"]>

  export type AudioFileSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    dialogueId?: boolean
    filename?: boolean
    filePath?: boolean
    fileSize?: boolean
    duration?: boolean
    generatedAt?: boolean
    success?: boolean
    errorMessage?: boolean
    session?: boolean | SessionDefaultArgs<ExtArgs>
    dialogue?: boolean | AudioFile$dialogueArgs<ExtArgs>
  }, ExtArgs["result"]["audioFile"]>

  export type AudioFileSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    dialogueId?: boolean
    filename?: boolean
    filePath?: boolean
    fileSize?: boolean
    duration?: boolean
    generatedAt?: boolean
    success?: boolean
    errorMessage?: boolean
    session?: boolean | SessionDefaultArgs<ExtArgs>
    dialogue?: boolean | AudioFile$dialogueArgs<ExtArgs>
  }, ExtArgs["result"]["audioFile"]>

  export type AudioFileSelectScalar = {
    id?: boolean
    sessionId?: boolean
    dialogueId?: boolean
    filename?: boolean
    filePath?: boolean
    fileSize?: boolean
    duration?: boolean
    generatedAt?: boolean
    success?: boolean
    errorMessage?: boolean
  }

  export type AudioFileOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "sessionId" | "dialogueId" | "filename" | "filePath" | "fileSize" | "duration" | "generatedAt" | "success" | "errorMessage", ExtArgs["result"]["audioFile"]>
  export type AudioFileInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    session?: boolean | SessionDefaultArgs<ExtArgs>
    dialogue?: boolean | AudioFile$dialogueArgs<ExtArgs>
  }
  export type AudioFileIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    session?: boolean | SessionDefaultArgs<ExtArgs>
    dialogue?: boolean | AudioFile$dialogueArgs<ExtArgs>
  }
  export type AudioFileIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    session?: boolean | SessionDefaultArgs<ExtArgs>
    dialogue?: boolean | AudioFile$dialogueArgs<ExtArgs>
  }

  export type $AudioFilePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AudioFile"
    objects: {
      session: Prisma.$SessionPayload<ExtArgs>
      dialogue: Prisma.$DialoguePayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      sessionId: string
      dialogueId: string | null
      filename: string
      filePath: string
      fileSize: number | null
      duration: number | null
      generatedAt: Date
      success: boolean
      errorMessage: string | null
    }, ExtArgs["result"]["audioFile"]>
    composites: {}
  }

  type AudioFileGetPayload<S extends boolean | null | undefined | AudioFileDefaultArgs> = $Result.GetResult<Prisma.$AudioFilePayload, S>

  type AudioFileCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AudioFileFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AudioFileCountAggregateInputType | true
    }

  export interface AudioFileDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AudioFile'], meta: { name: 'AudioFile' } }
    /**
     * Find zero or one AudioFile that matches the filter.
     * @param {AudioFileFindUniqueArgs} args - Arguments to find a AudioFile
     * @example
     * // Get one AudioFile
     * const audioFile = await prisma.audioFile.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AudioFileFindUniqueArgs>(args: SelectSubset<T, AudioFileFindUniqueArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AudioFile that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AudioFileFindUniqueOrThrowArgs} args - Arguments to find a AudioFile
     * @example
     * // Get one AudioFile
     * const audioFile = await prisma.audioFile.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AudioFileFindUniqueOrThrowArgs>(args: SelectSubset<T, AudioFileFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AudioFile that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileFindFirstArgs} args - Arguments to find a AudioFile
     * @example
     * // Get one AudioFile
     * const audioFile = await prisma.audioFile.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AudioFileFindFirstArgs>(args?: SelectSubset<T, AudioFileFindFirstArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AudioFile that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileFindFirstOrThrowArgs} args - Arguments to find a AudioFile
     * @example
     * // Get one AudioFile
     * const audioFile = await prisma.audioFile.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AudioFileFindFirstOrThrowArgs>(args?: SelectSubset<T, AudioFileFindFirstOrThrowArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AudioFiles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AudioFiles
     * const audioFiles = await prisma.audioFile.findMany()
     * 
     * // Get first 10 AudioFiles
     * const audioFiles = await prisma.audioFile.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const audioFileWithIdOnly = await prisma.audioFile.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AudioFileFindManyArgs>(args?: SelectSubset<T, AudioFileFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AudioFile.
     * @param {AudioFileCreateArgs} args - Arguments to create a AudioFile.
     * @example
     * // Create one AudioFile
     * const AudioFile = await prisma.audioFile.create({
     *   data: {
     *     // ... data to create a AudioFile
     *   }
     * })
     * 
     */
    create<T extends AudioFileCreateArgs>(args: SelectSubset<T, AudioFileCreateArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AudioFiles.
     * @param {AudioFileCreateManyArgs} args - Arguments to create many AudioFiles.
     * @example
     * // Create many AudioFiles
     * const audioFile = await prisma.audioFile.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AudioFileCreateManyArgs>(args?: SelectSubset<T, AudioFileCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AudioFiles and returns the data saved in the database.
     * @param {AudioFileCreateManyAndReturnArgs} args - Arguments to create many AudioFiles.
     * @example
     * // Create many AudioFiles
     * const audioFile = await prisma.audioFile.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AudioFiles and only return the `id`
     * const audioFileWithIdOnly = await prisma.audioFile.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AudioFileCreateManyAndReturnArgs>(args?: SelectSubset<T, AudioFileCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AudioFile.
     * @param {AudioFileDeleteArgs} args - Arguments to delete one AudioFile.
     * @example
     * // Delete one AudioFile
     * const AudioFile = await prisma.audioFile.delete({
     *   where: {
     *     // ... filter to delete one AudioFile
     *   }
     * })
     * 
     */
    delete<T extends AudioFileDeleteArgs>(args: SelectSubset<T, AudioFileDeleteArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AudioFile.
     * @param {AudioFileUpdateArgs} args - Arguments to update one AudioFile.
     * @example
     * // Update one AudioFile
     * const audioFile = await prisma.audioFile.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AudioFileUpdateArgs>(args: SelectSubset<T, AudioFileUpdateArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AudioFiles.
     * @param {AudioFileDeleteManyArgs} args - Arguments to filter AudioFiles to delete.
     * @example
     * // Delete a few AudioFiles
     * const { count } = await prisma.audioFile.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AudioFileDeleteManyArgs>(args?: SelectSubset<T, AudioFileDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AudioFiles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AudioFiles
     * const audioFile = await prisma.audioFile.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AudioFileUpdateManyArgs>(args: SelectSubset<T, AudioFileUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AudioFiles and returns the data updated in the database.
     * @param {AudioFileUpdateManyAndReturnArgs} args - Arguments to update many AudioFiles.
     * @example
     * // Update many AudioFiles
     * const audioFile = await prisma.audioFile.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AudioFiles and only return the `id`
     * const audioFileWithIdOnly = await prisma.audioFile.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AudioFileUpdateManyAndReturnArgs>(args: SelectSubset<T, AudioFileUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AudioFile.
     * @param {AudioFileUpsertArgs} args - Arguments to update or create a AudioFile.
     * @example
     * // Update or create a AudioFile
     * const audioFile = await prisma.audioFile.upsert({
     *   create: {
     *     // ... data to create a AudioFile
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AudioFile we want to update
     *   }
     * })
     */
    upsert<T extends AudioFileUpsertArgs>(args: SelectSubset<T, AudioFileUpsertArgs<ExtArgs>>): Prisma__AudioFileClient<$Result.GetResult<Prisma.$AudioFilePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AudioFiles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileCountArgs} args - Arguments to filter AudioFiles to count.
     * @example
     * // Count the number of AudioFiles
     * const count = await prisma.audioFile.count({
     *   where: {
     *     // ... the filter for the AudioFiles we want to count
     *   }
     * })
    **/
    count<T extends AudioFileCountArgs>(
      args?: Subset<T, AudioFileCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AudioFileCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AudioFile.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AudioFileAggregateArgs>(args: Subset<T, AudioFileAggregateArgs>): Prisma.PrismaPromise<GetAudioFileAggregateType<T>>

    /**
     * Group by AudioFile.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AudioFileGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AudioFileGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AudioFileGroupByArgs['orderBy'] }
        : { orderBy?: AudioFileGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AudioFileGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAudioFileGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AudioFile model
   */
  readonly fields: AudioFileFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AudioFile.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AudioFileClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    session<T extends SessionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SessionDefaultArgs<ExtArgs>>): Prisma__SessionClient<$Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    dialogue<T extends AudioFile$dialogueArgs<ExtArgs> = {}>(args?: Subset<T, AudioFile$dialogueArgs<ExtArgs>>): Prisma__DialogueClient<$Result.GetResult<Prisma.$DialoguePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AudioFile model
   */
  interface AudioFileFieldRefs {
    readonly id: FieldRef<"AudioFile", 'String'>
    readonly sessionId: FieldRef<"AudioFile", 'String'>
    readonly dialogueId: FieldRef<"AudioFile", 'String'>
    readonly filename: FieldRef<"AudioFile", 'String'>
    readonly filePath: FieldRef<"AudioFile", 'String'>
    readonly fileSize: FieldRef<"AudioFile", 'Int'>
    readonly duration: FieldRef<"AudioFile", 'Float'>
    readonly generatedAt: FieldRef<"AudioFile", 'DateTime'>
    readonly success: FieldRef<"AudioFile", 'Boolean'>
    readonly errorMessage: FieldRef<"AudioFile", 'String'>
  }
    

  // Custom InputTypes
  /**
   * AudioFile findUnique
   */
  export type AudioFileFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * Filter, which AudioFile to fetch.
     */
    where: AudioFileWhereUniqueInput
  }

  /**
   * AudioFile findUniqueOrThrow
   */
  export type AudioFileFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * Filter, which AudioFile to fetch.
     */
    where: AudioFileWhereUniqueInput
  }

  /**
   * AudioFile findFirst
   */
  export type AudioFileFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * Filter, which AudioFile to fetch.
     */
    where?: AudioFileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AudioFiles to fetch.
     */
    orderBy?: AudioFileOrderByWithRelationInput | AudioFileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AudioFiles.
     */
    cursor?: AudioFileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AudioFiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AudioFiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AudioFiles.
     */
    distinct?: AudioFileScalarFieldEnum | AudioFileScalarFieldEnum[]
  }

  /**
   * AudioFile findFirstOrThrow
   */
  export type AudioFileFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * Filter, which AudioFile to fetch.
     */
    where?: AudioFileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AudioFiles to fetch.
     */
    orderBy?: AudioFileOrderByWithRelationInput | AudioFileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AudioFiles.
     */
    cursor?: AudioFileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AudioFiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AudioFiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AudioFiles.
     */
    distinct?: AudioFileScalarFieldEnum | AudioFileScalarFieldEnum[]
  }

  /**
   * AudioFile findMany
   */
  export type AudioFileFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * Filter, which AudioFiles to fetch.
     */
    where?: AudioFileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AudioFiles to fetch.
     */
    orderBy?: AudioFileOrderByWithRelationInput | AudioFileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AudioFiles.
     */
    cursor?: AudioFileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AudioFiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AudioFiles.
     */
    skip?: number
    distinct?: AudioFileScalarFieldEnum | AudioFileScalarFieldEnum[]
  }

  /**
   * AudioFile create
   */
  export type AudioFileCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * The data needed to create a AudioFile.
     */
    data: XOR<AudioFileCreateInput, AudioFileUncheckedCreateInput>
  }

  /**
   * AudioFile createMany
   */
  export type AudioFileCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AudioFiles.
     */
    data: AudioFileCreateManyInput | AudioFileCreateManyInput[]
  }

  /**
   * AudioFile createManyAndReturn
   */
  export type AudioFileCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * The data used to create many AudioFiles.
     */
    data: AudioFileCreateManyInput | AudioFileCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * AudioFile update
   */
  export type AudioFileUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * The data needed to update a AudioFile.
     */
    data: XOR<AudioFileUpdateInput, AudioFileUncheckedUpdateInput>
    /**
     * Choose, which AudioFile to update.
     */
    where: AudioFileWhereUniqueInput
  }

  /**
   * AudioFile updateMany
   */
  export type AudioFileUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AudioFiles.
     */
    data: XOR<AudioFileUpdateManyMutationInput, AudioFileUncheckedUpdateManyInput>
    /**
     * Filter which AudioFiles to update
     */
    where?: AudioFileWhereInput
    /**
     * Limit how many AudioFiles to update.
     */
    limit?: number
  }

  /**
   * AudioFile updateManyAndReturn
   */
  export type AudioFileUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * The data used to update AudioFiles.
     */
    data: XOR<AudioFileUpdateManyMutationInput, AudioFileUncheckedUpdateManyInput>
    /**
     * Filter which AudioFiles to update
     */
    where?: AudioFileWhereInput
    /**
     * Limit how many AudioFiles to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * AudioFile upsert
   */
  export type AudioFileUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * The filter to search for the AudioFile to update in case it exists.
     */
    where: AudioFileWhereUniqueInput
    /**
     * In case the AudioFile found by the `where` argument doesn't exist, create a new AudioFile with this data.
     */
    create: XOR<AudioFileCreateInput, AudioFileUncheckedCreateInput>
    /**
     * In case the AudioFile was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AudioFileUpdateInput, AudioFileUncheckedUpdateInput>
  }

  /**
   * AudioFile delete
   */
  export type AudioFileDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
    /**
     * Filter which AudioFile to delete.
     */
    where: AudioFileWhereUniqueInput
  }

  /**
   * AudioFile deleteMany
   */
  export type AudioFileDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AudioFiles to delete
     */
    where?: AudioFileWhereInput
    /**
     * Limit how many AudioFiles to delete.
     */
    limit?: number
  }

  /**
   * AudioFile.dialogue
   */
  export type AudioFile$dialogueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Dialogue
     */
    select?: DialogueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Dialogue
     */
    omit?: DialogueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DialogueInclude<ExtArgs> | null
    where?: DialogueWhereInput
  }

  /**
   * AudioFile without action
   */
  export type AudioFileDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AudioFile
     */
    select?: AudioFileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AudioFile
     */
    omit?: AudioFileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AudioFileInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const SessionScalarFieldEnum: {
    id: 'id',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    name: 'name',
    exaggeration: 'exaggeration',
    temperature: 'temperature',
    seedNum: 'seedNum',
    cfgWeight: 'cfgWeight',
    minP: 'minP',
    topP: 'topP',
    repetitionPenalty: 'repetitionPenalty',
    totalDialogues: 'totalDialogues',
    audioFilesGenerated: 'audioFilesGenerated',
    allSuccessful: 'allSuccessful'
  };

  export type SessionScalarFieldEnum = (typeof SessionScalarFieldEnum)[keyof typeof SessionScalarFieldEnum]


  export const DialogueScalarFieldEnum: {
    id: 'id',
    sessionId: 'sessionId',
    text: 'text',
    character: 'character',
    order: 'order',
    createdAt: 'createdAt'
  };

  export type DialogueScalarFieldEnum = (typeof DialogueScalarFieldEnum)[keyof typeof DialogueScalarFieldEnum]


  export const AudioFileScalarFieldEnum: {
    id: 'id',
    sessionId: 'sessionId',
    dialogueId: 'dialogueId',
    filename: 'filename',
    filePath: 'filePath',
    fileSize: 'fileSize',
    duration: 'duration',
    generatedAt: 'generatedAt',
    success: 'success',
    errorMessage: 'errorMessage'
  };

  export type AudioFileScalarFieldEnum = (typeof AudioFileScalarFieldEnum)[keyof typeof AudioFileScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    
  /**
   * Deep Input Types
   */


  export type SessionWhereInput = {
    AND?: SessionWhereInput | SessionWhereInput[]
    OR?: SessionWhereInput[]
    NOT?: SessionWhereInput | SessionWhereInput[]
    id?: StringFilter<"Session"> | string
    createdAt?: DateTimeFilter<"Session"> | Date | string
    updatedAt?: DateTimeFilter<"Session"> | Date | string
    name?: StringNullableFilter<"Session"> | string | null
    exaggeration?: FloatFilter<"Session"> | number
    temperature?: FloatFilter<"Session"> | number
    seedNum?: IntFilter<"Session"> | number
    cfgWeight?: FloatFilter<"Session"> | number
    minP?: FloatFilter<"Session"> | number
    topP?: FloatFilter<"Session"> | number
    repetitionPenalty?: FloatFilter<"Session"> | number
    totalDialogues?: IntFilter<"Session"> | number
    audioFilesGenerated?: IntFilter<"Session"> | number
    allSuccessful?: BoolFilter<"Session"> | boolean
    dialogues?: DialogueListRelationFilter
    audioFiles?: AudioFileListRelationFilter
  }

  export type SessionOrderByWithRelationInput = {
    id?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    name?: SortOrderInput | SortOrder
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
    allSuccessful?: SortOrder
    dialogues?: DialogueOrderByRelationAggregateInput
    audioFiles?: AudioFileOrderByRelationAggregateInput
  }

  export type SessionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SessionWhereInput | SessionWhereInput[]
    OR?: SessionWhereInput[]
    NOT?: SessionWhereInput | SessionWhereInput[]
    createdAt?: DateTimeFilter<"Session"> | Date | string
    updatedAt?: DateTimeFilter<"Session"> | Date | string
    name?: StringNullableFilter<"Session"> | string | null
    exaggeration?: FloatFilter<"Session"> | number
    temperature?: FloatFilter<"Session"> | number
    seedNum?: IntFilter<"Session"> | number
    cfgWeight?: FloatFilter<"Session"> | number
    minP?: FloatFilter<"Session"> | number
    topP?: FloatFilter<"Session"> | number
    repetitionPenalty?: FloatFilter<"Session"> | number
    totalDialogues?: IntFilter<"Session"> | number
    audioFilesGenerated?: IntFilter<"Session"> | number
    allSuccessful?: BoolFilter<"Session"> | boolean
    dialogues?: DialogueListRelationFilter
    audioFiles?: AudioFileListRelationFilter
  }, "id">

  export type SessionOrderByWithAggregationInput = {
    id?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    name?: SortOrderInput | SortOrder
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
    allSuccessful?: SortOrder
    _count?: SessionCountOrderByAggregateInput
    _avg?: SessionAvgOrderByAggregateInput
    _max?: SessionMaxOrderByAggregateInput
    _min?: SessionMinOrderByAggregateInput
    _sum?: SessionSumOrderByAggregateInput
  }

  export type SessionScalarWhereWithAggregatesInput = {
    AND?: SessionScalarWhereWithAggregatesInput | SessionScalarWhereWithAggregatesInput[]
    OR?: SessionScalarWhereWithAggregatesInput[]
    NOT?: SessionScalarWhereWithAggregatesInput | SessionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Session"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Session"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Session"> | Date | string
    name?: StringNullableWithAggregatesFilter<"Session"> | string | null
    exaggeration?: FloatWithAggregatesFilter<"Session"> | number
    temperature?: FloatWithAggregatesFilter<"Session"> | number
    seedNum?: IntWithAggregatesFilter<"Session"> | number
    cfgWeight?: FloatWithAggregatesFilter<"Session"> | number
    minP?: FloatWithAggregatesFilter<"Session"> | number
    topP?: FloatWithAggregatesFilter<"Session"> | number
    repetitionPenalty?: FloatWithAggregatesFilter<"Session"> | number
    totalDialogues?: IntWithAggregatesFilter<"Session"> | number
    audioFilesGenerated?: IntWithAggregatesFilter<"Session"> | number
    allSuccessful?: BoolWithAggregatesFilter<"Session"> | boolean
  }

  export type DialogueWhereInput = {
    AND?: DialogueWhereInput | DialogueWhereInput[]
    OR?: DialogueWhereInput[]
    NOT?: DialogueWhereInput | DialogueWhereInput[]
    id?: StringFilter<"Dialogue"> | string
    sessionId?: StringFilter<"Dialogue"> | string
    text?: StringFilter<"Dialogue"> | string
    character?: StringFilter<"Dialogue"> | string
    order?: IntFilter<"Dialogue"> | number
    createdAt?: DateTimeFilter<"Dialogue"> | Date | string
    session?: XOR<SessionScalarRelationFilter, SessionWhereInput>
    audioFile?: XOR<AudioFileNullableScalarRelationFilter, AudioFileWhereInput> | null
  }

  export type DialogueOrderByWithRelationInput = {
    id?: SortOrder
    sessionId?: SortOrder
    text?: SortOrder
    character?: SortOrder
    order?: SortOrder
    createdAt?: SortOrder
    session?: SessionOrderByWithRelationInput
    audioFile?: AudioFileOrderByWithRelationInput
  }

  export type DialogueWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: DialogueWhereInput | DialogueWhereInput[]
    OR?: DialogueWhereInput[]
    NOT?: DialogueWhereInput | DialogueWhereInput[]
    sessionId?: StringFilter<"Dialogue"> | string
    text?: StringFilter<"Dialogue"> | string
    character?: StringFilter<"Dialogue"> | string
    order?: IntFilter<"Dialogue"> | number
    createdAt?: DateTimeFilter<"Dialogue"> | Date | string
    session?: XOR<SessionScalarRelationFilter, SessionWhereInput>
    audioFile?: XOR<AudioFileNullableScalarRelationFilter, AudioFileWhereInput> | null
  }, "id">

  export type DialogueOrderByWithAggregationInput = {
    id?: SortOrder
    sessionId?: SortOrder
    text?: SortOrder
    character?: SortOrder
    order?: SortOrder
    createdAt?: SortOrder
    _count?: DialogueCountOrderByAggregateInput
    _avg?: DialogueAvgOrderByAggregateInput
    _max?: DialogueMaxOrderByAggregateInput
    _min?: DialogueMinOrderByAggregateInput
    _sum?: DialogueSumOrderByAggregateInput
  }

  export type DialogueScalarWhereWithAggregatesInput = {
    AND?: DialogueScalarWhereWithAggregatesInput | DialogueScalarWhereWithAggregatesInput[]
    OR?: DialogueScalarWhereWithAggregatesInput[]
    NOT?: DialogueScalarWhereWithAggregatesInput | DialogueScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Dialogue"> | string
    sessionId?: StringWithAggregatesFilter<"Dialogue"> | string
    text?: StringWithAggregatesFilter<"Dialogue"> | string
    character?: StringWithAggregatesFilter<"Dialogue"> | string
    order?: IntWithAggregatesFilter<"Dialogue"> | number
    createdAt?: DateTimeWithAggregatesFilter<"Dialogue"> | Date | string
  }

  export type AudioFileWhereInput = {
    AND?: AudioFileWhereInput | AudioFileWhereInput[]
    OR?: AudioFileWhereInput[]
    NOT?: AudioFileWhereInput | AudioFileWhereInput[]
    id?: StringFilter<"AudioFile"> | string
    sessionId?: StringFilter<"AudioFile"> | string
    dialogueId?: StringNullableFilter<"AudioFile"> | string | null
    filename?: StringFilter<"AudioFile"> | string
    filePath?: StringFilter<"AudioFile"> | string
    fileSize?: IntNullableFilter<"AudioFile"> | number | null
    duration?: FloatNullableFilter<"AudioFile"> | number | null
    generatedAt?: DateTimeFilter<"AudioFile"> | Date | string
    success?: BoolFilter<"AudioFile"> | boolean
    errorMessage?: StringNullableFilter<"AudioFile"> | string | null
    session?: XOR<SessionScalarRelationFilter, SessionWhereInput>
    dialogue?: XOR<DialogueNullableScalarRelationFilter, DialogueWhereInput> | null
  }

  export type AudioFileOrderByWithRelationInput = {
    id?: SortOrder
    sessionId?: SortOrder
    dialogueId?: SortOrderInput | SortOrder
    filename?: SortOrder
    filePath?: SortOrder
    fileSize?: SortOrderInput | SortOrder
    duration?: SortOrderInput | SortOrder
    generatedAt?: SortOrder
    success?: SortOrder
    errorMessage?: SortOrderInput | SortOrder
    session?: SessionOrderByWithRelationInput
    dialogue?: DialogueOrderByWithRelationInput
  }

  export type AudioFileWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    dialogueId?: string
    filePath?: string
    AND?: AudioFileWhereInput | AudioFileWhereInput[]
    OR?: AudioFileWhereInput[]
    NOT?: AudioFileWhereInput | AudioFileWhereInput[]
    sessionId?: StringFilter<"AudioFile"> | string
    filename?: StringFilter<"AudioFile"> | string
    fileSize?: IntNullableFilter<"AudioFile"> | number | null
    duration?: FloatNullableFilter<"AudioFile"> | number | null
    generatedAt?: DateTimeFilter<"AudioFile"> | Date | string
    success?: BoolFilter<"AudioFile"> | boolean
    errorMessage?: StringNullableFilter<"AudioFile"> | string | null
    session?: XOR<SessionScalarRelationFilter, SessionWhereInput>
    dialogue?: XOR<DialogueNullableScalarRelationFilter, DialogueWhereInput> | null
  }, "id" | "dialogueId" | "filePath">

  export type AudioFileOrderByWithAggregationInput = {
    id?: SortOrder
    sessionId?: SortOrder
    dialogueId?: SortOrderInput | SortOrder
    filename?: SortOrder
    filePath?: SortOrder
    fileSize?: SortOrderInput | SortOrder
    duration?: SortOrderInput | SortOrder
    generatedAt?: SortOrder
    success?: SortOrder
    errorMessage?: SortOrderInput | SortOrder
    _count?: AudioFileCountOrderByAggregateInput
    _avg?: AudioFileAvgOrderByAggregateInput
    _max?: AudioFileMaxOrderByAggregateInput
    _min?: AudioFileMinOrderByAggregateInput
    _sum?: AudioFileSumOrderByAggregateInput
  }

  export type AudioFileScalarWhereWithAggregatesInput = {
    AND?: AudioFileScalarWhereWithAggregatesInput | AudioFileScalarWhereWithAggregatesInput[]
    OR?: AudioFileScalarWhereWithAggregatesInput[]
    NOT?: AudioFileScalarWhereWithAggregatesInput | AudioFileScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AudioFile"> | string
    sessionId?: StringWithAggregatesFilter<"AudioFile"> | string
    dialogueId?: StringNullableWithAggregatesFilter<"AudioFile"> | string | null
    filename?: StringWithAggregatesFilter<"AudioFile"> | string
    filePath?: StringWithAggregatesFilter<"AudioFile"> | string
    fileSize?: IntNullableWithAggregatesFilter<"AudioFile"> | number | null
    duration?: FloatNullableWithAggregatesFilter<"AudioFile"> | number | null
    generatedAt?: DateTimeWithAggregatesFilter<"AudioFile"> | Date | string
    success?: BoolWithAggregatesFilter<"AudioFile"> | boolean
    errorMessage?: StringNullableWithAggregatesFilter<"AudioFile"> | string | null
  }

  export type SessionCreateInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
    dialogues?: DialogueCreateNestedManyWithoutSessionInput
    audioFiles?: AudioFileCreateNestedManyWithoutSessionInput
  }

  export type SessionUncheckedCreateInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
    dialogues?: DialogueUncheckedCreateNestedManyWithoutSessionInput
    audioFiles?: AudioFileUncheckedCreateNestedManyWithoutSessionInput
  }

  export type SessionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
    dialogues?: DialogueUpdateManyWithoutSessionNestedInput
    audioFiles?: AudioFileUpdateManyWithoutSessionNestedInput
  }

  export type SessionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
    dialogues?: DialogueUncheckedUpdateManyWithoutSessionNestedInput
    audioFiles?: AudioFileUncheckedUpdateManyWithoutSessionNestedInput
  }

  export type SessionCreateManyInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
  }

  export type SessionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
  }

  export type SessionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
  }

  export type DialogueCreateInput = {
    id?: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
    session: SessionCreateNestedOneWithoutDialoguesInput
    audioFile?: AudioFileCreateNestedOneWithoutDialogueInput
  }

  export type DialogueUncheckedCreateInput = {
    id?: string
    sessionId: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
    audioFile?: AudioFileUncheckedCreateNestedOneWithoutDialogueInput
  }

  export type DialogueUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    session?: SessionUpdateOneRequiredWithoutDialoguesNestedInput
    audioFile?: AudioFileUpdateOneWithoutDialogueNestedInput
  }

  export type DialogueUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    audioFile?: AudioFileUncheckedUpdateOneWithoutDialogueNestedInput
  }

  export type DialogueCreateManyInput = {
    id?: string
    sessionId: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
  }

  export type DialogueUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DialogueUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AudioFileCreateInput = {
    id?: string
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
    session: SessionCreateNestedOneWithoutAudioFilesInput
    dialogue?: DialogueCreateNestedOneWithoutAudioFileInput
  }

  export type AudioFileUncheckedCreateInput = {
    id?: string
    sessionId: string
    dialogueId?: string | null
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
  }

  export type AudioFileUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    session?: SessionUpdateOneRequiredWithoutAudioFilesNestedInput
    dialogue?: DialogueUpdateOneWithoutAudioFileNestedInput
  }

  export type AudioFileUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    dialogueId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AudioFileCreateManyInput = {
    id?: string
    sessionId: string
    dialogueId?: string | null
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
  }

  export type AudioFileUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AudioFileUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    dialogueId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type DialogueListRelationFilter = {
    every?: DialogueWhereInput
    some?: DialogueWhereInput
    none?: DialogueWhereInput
  }

  export type AudioFileListRelationFilter = {
    every?: AudioFileWhereInput
    some?: AudioFileWhereInput
    none?: AudioFileWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type DialogueOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type AudioFileOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SessionCountOrderByAggregateInput = {
    id?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    name?: SortOrder
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
    allSuccessful?: SortOrder
  }

  export type SessionAvgOrderByAggregateInput = {
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
  }

  export type SessionMaxOrderByAggregateInput = {
    id?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    name?: SortOrder
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
    allSuccessful?: SortOrder
  }

  export type SessionMinOrderByAggregateInput = {
    id?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    name?: SortOrder
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
    allSuccessful?: SortOrder
  }

  export type SessionSumOrderByAggregateInput = {
    exaggeration?: SortOrder
    temperature?: SortOrder
    seedNum?: SortOrder
    cfgWeight?: SortOrder
    minP?: SortOrder
    topP?: SortOrder
    repetitionPenalty?: SortOrder
    totalDialogues?: SortOrder
    audioFilesGenerated?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type SessionScalarRelationFilter = {
    is?: SessionWhereInput
    isNot?: SessionWhereInput
  }

  export type AudioFileNullableScalarRelationFilter = {
    is?: AudioFileWhereInput | null
    isNot?: AudioFileWhereInput | null
  }

  export type DialogueCountOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    text?: SortOrder
    character?: SortOrder
    order?: SortOrder
    createdAt?: SortOrder
  }

  export type DialogueAvgOrderByAggregateInput = {
    order?: SortOrder
  }

  export type DialogueMaxOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    text?: SortOrder
    character?: SortOrder
    order?: SortOrder
    createdAt?: SortOrder
  }

  export type DialogueMinOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    text?: SortOrder
    character?: SortOrder
    order?: SortOrder
    createdAt?: SortOrder
  }

  export type DialogueSumOrderByAggregateInput = {
    order?: SortOrder
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type FloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type DialogueNullableScalarRelationFilter = {
    is?: DialogueWhereInput | null
    isNot?: DialogueWhereInput | null
  }

  export type AudioFileCountOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    dialogueId?: SortOrder
    filename?: SortOrder
    filePath?: SortOrder
    fileSize?: SortOrder
    duration?: SortOrder
    generatedAt?: SortOrder
    success?: SortOrder
    errorMessage?: SortOrder
  }

  export type AudioFileAvgOrderByAggregateInput = {
    fileSize?: SortOrder
    duration?: SortOrder
  }

  export type AudioFileMaxOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    dialogueId?: SortOrder
    filename?: SortOrder
    filePath?: SortOrder
    fileSize?: SortOrder
    duration?: SortOrder
    generatedAt?: SortOrder
    success?: SortOrder
    errorMessage?: SortOrder
  }

  export type AudioFileMinOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    dialogueId?: SortOrder
    filename?: SortOrder
    filePath?: SortOrder
    fileSize?: SortOrder
    duration?: SortOrder
    generatedAt?: SortOrder
    success?: SortOrder
    errorMessage?: SortOrder
  }

  export type AudioFileSumOrderByAggregateInput = {
    fileSize?: SortOrder
    duration?: SortOrder
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type FloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type DialogueCreateNestedManyWithoutSessionInput = {
    create?: XOR<DialogueCreateWithoutSessionInput, DialogueUncheckedCreateWithoutSessionInput> | DialogueCreateWithoutSessionInput[] | DialogueUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: DialogueCreateOrConnectWithoutSessionInput | DialogueCreateOrConnectWithoutSessionInput[]
    createMany?: DialogueCreateManySessionInputEnvelope
    connect?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
  }

  export type AudioFileCreateNestedManyWithoutSessionInput = {
    create?: XOR<AudioFileCreateWithoutSessionInput, AudioFileUncheckedCreateWithoutSessionInput> | AudioFileCreateWithoutSessionInput[] | AudioFileUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: AudioFileCreateOrConnectWithoutSessionInput | AudioFileCreateOrConnectWithoutSessionInput[]
    createMany?: AudioFileCreateManySessionInputEnvelope
    connect?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
  }

  export type DialogueUncheckedCreateNestedManyWithoutSessionInput = {
    create?: XOR<DialogueCreateWithoutSessionInput, DialogueUncheckedCreateWithoutSessionInput> | DialogueCreateWithoutSessionInput[] | DialogueUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: DialogueCreateOrConnectWithoutSessionInput | DialogueCreateOrConnectWithoutSessionInput[]
    createMany?: DialogueCreateManySessionInputEnvelope
    connect?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
  }

  export type AudioFileUncheckedCreateNestedManyWithoutSessionInput = {
    create?: XOR<AudioFileCreateWithoutSessionInput, AudioFileUncheckedCreateWithoutSessionInput> | AudioFileCreateWithoutSessionInput[] | AudioFileUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: AudioFileCreateOrConnectWithoutSessionInput | AudioFileCreateOrConnectWithoutSessionInput[]
    createMany?: AudioFileCreateManySessionInputEnvelope
    connect?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type DialogueUpdateManyWithoutSessionNestedInput = {
    create?: XOR<DialogueCreateWithoutSessionInput, DialogueUncheckedCreateWithoutSessionInput> | DialogueCreateWithoutSessionInput[] | DialogueUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: DialogueCreateOrConnectWithoutSessionInput | DialogueCreateOrConnectWithoutSessionInput[]
    upsert?: DialogueUpsertWithWhereUniqueWithoutSessionInput | DialogueUpsertWithWhereUniqueWithoutSessionInput[]
    createMany?: DialogueCreateManySessionInputEnvelope
    set?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    disconnect?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    delete?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    connect?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    update?: DialogueUpdateWithWhereUniqueWithoutSessionInput | DialogueUpdateWithWhereUniqueWithoutSessionInput[]
    updateMany?: DialogueUpdateManyWithWhereWithoutSessionInput | DialogueUpdateManyWithWhereWithoutSessionInput[]
    deleteMany?: DialogueScalarWhereInput | DialogueScalarWhereInput[]
  }

  export type AudioFileUpdateManyWithoutSessionNestedInput = {
    create?: XOR<AudioFileCreateWithoutSessionInput, AudioFileUncheckedCreateWithoutSessionInput> | AudioFileCreateWithoutSessionInput[] | AudioFileUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: AudioFileCreateOrConnectWithoutSessionInput | AudioFileCreateOrConnectWithoutSessionInput[]
    upsert?: AudioFileUpsertWithWhereUniqueWithoutSessionInput | AudioFileUpsertWithWhereUniqueWithoutSessionInput[]
    createMany?: AudioFileCreateManySessionInputEnvelope
    set?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    disconnect?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    delete?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    connect?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    update?: AudioFileUpdateWithWhereUniqueWithoutSessionInput | AudioFileUpdateWithWhereUniqueWithoutSessionInput[]
    updateMany?: AudioFileUpdateManyWithWhereWithoutSessionInput | AudioFileUpdateManyWithWhereWithoutSessionInput[]
    deleteMany?: AudioFileScalarWhereInput | AudioFileScalarWhereInput[]
  }

  export type DialogueUncheckedUpdateManyWithoutSessionNestedInput = {
    create?: XOR<DialogueCreateWithoutSessionInput, DialogueUncheckedCreateWithoutSessionInput> | DialogueCreateWithoutSessionInput[] | DialogueUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: DialogueCreateOrConnectWithoutSessionInput | DialogueCreateOrConnectWithoutSessionInput[]
    upsert?: DialogueUpsertWithWhereUniqueWithoutSessionInput | DialogueUpsertWithWhereUniqueWithoutSessionInput[]
    createMany?: DialogueCreateManySessionInputEnvelope
    set?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    disconnect?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    delete?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    connect?: DialogueWhereUniqueInput | DialogueWhereUniqueInput[]
    update?: DialogueUpdateWithWhereUniqueWithoutSessionInput | DialogueUpdateWithWhereUniqueWithoutSessionInput[]
    updateMany?: DialogueUpdateManyWithWhereWithoutSessionInput | DialogueUpdateManyWithWhereWithoutSessionInput[]
    deleteMany?: DialogueScalarWhereInput | DialogueScalarWhereInput[]
  }

  export type AudioFileUncheckedUpdateManyWithoutSessionNestedInput = {
    create?: XOR<AudioFileCreateWithoutSessionInput, AudioFileUncheckedCreateWithoutSessionInput> | AudioFileCreateWithoutSessionInput[] | AudioFileUncheckedCreateWithoutSessionInput[]
    connectOrCreate?: AudioFileCreateOrConnectWithoutSessionInput | AudioFileCreateOrConnectWithoutSessionInput[]
    upsert?: AudioFileUpsertWithWhereUniqueWithoutSessionInput | AudioFileUpsertWithWhereUniqueWithoutSessionInput[]
    createMany?: AudioFileCreateManySessionInputEnvelope
    set?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    disconnect?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    delete?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    connect?: AudioFileWhereUniqueInput | AudioFileWhereUniqueInput[]
    update?: AudioFileUpdateWithWhereUniqueWithoutSessionInput | AudioFileUpdateWithWhereUniqueWithoutSessionInput[]
    updateMany?: AudioFileUpdateManyWithWhereWithoutSessionInput | AudioFileUpdateManyWithWhereWithoutSessionInput[]
    deleteMany?: AudioFileScalarWhereInput | AudioFileScalarWhereInput[]
  }

  export type SessionCreateNestedOneWithoutDialoguesInput = {
    create?: XOR<SessionCreateWithoutDialoguesInput, SessionUncheckedCreateWithoutDialoguesInput>
    connectOrCreate?: SessionCreateOrConnectWithoutDialoguesInput
    connect?: SessionWhereUniqueInput
  }

  export type AudioFileCreateNestedOneWithoutDialogueInput = {
    create?: XOR<AudioFileCreateWithoutDialogueInput, AudioFileUncheckedCreateWithoutDialogueInput>
    connectOrCreate?: AudioFileCreateOrConnectWithoutDialogueInput
    connect?: AudioFileWhereUniqueInput
  }

  export type AudioFileUncheckedCreateNestedOneWithoutDialogueInput = {
    create?: XOR<AudioFileCreateWithoutDialogueInput, AudioFileUncheckedCreateWithoutDialogueInput>
    connectOrCreate?: AudioFileCreateOrConnectWithoutDialogueInput
    connect?: AudioFileWhereUniqueInput
  }

  export type SessionUpdateOneRequiredWithoutDialoguesNestedInput = {
    create?: XOR<SessionCreateWithoutDialoguesInput, SessionUncheckedCreateWithoutDialoguesInput>
    connectOrCreate?: SessionCreateOrConnectWithoutDialoguesInput
    upsert?: SessionUpsertWithoutDialoguesInput
    connect?: SessionWhereUniqueInput
    update?: XOR<XOR<SessionUpdateToOneWithWhereWithoutDialoguesInput, SessionUpdateWithoutDialoguesInput>, SessionUncheckedUpdateWithoutDialoguesInput>
  }

  export type AudioFileUpdateOneWithoutDialogueNestedInput = {
    create?: XOR<AudioFileCreateWithoutDialogueInput, AudioFileUncheckedCreateWithoutDialogueInput>
    connectOrCreate?: AudioFileCreateOrConnectWithoutDialogueInput
    upsert?: AudioFileUpsertWithoutDialogueInput
    disconnect?: AudioFileWhereInput | boolean
    delete?: AudioFileWhereInput | boolean
    connect?: AudioFileWhereUniqueInput
    update?: XOR<XOR<AudioFileUpdateToOneWithWhereWithoutDialogueInput, AudioFileUpdateWithoutDialogueInput>, AudioFileUncheckedUpdateWithoutDialogueInput>
  }

  export type AudioFileUncheckedUpdateOneWithoutDialogueNestedInput = {
    create?: XOR<AudioFileCreateWithoutDialogueInput, AudioFileUncheckedCreateWithoutDialogueInput>
    connectOrCreate?: AudioFileCreateOrConnectWithoutDialogueInput
    upsert?: AudioFileUpsertWithoutDialogueInput
    disconnect?: AudioFileWhereInput | boolean
    delete?: AudioFileWhereInput | boolean
    connect?: AudioFileWhereUniqueInput
    update?: XOR<XOR<AudioFileUpdateToOneWithWhereWithoutDialogueInput, AudioFileUpdateWithoutDialogueInput>, AudioFileUncheckedUpdateWithoutDialogueInput>
  }

  export type SessionCreateNestedOneWithoutAudioFilesInput = {
    create?: XOR<SessionCreateWithoutAudioFilesInput, SessionUncheckedCreateWithoutAudioFilesInput>
    connectOrCreate?: SessionCreateOrConnectWithoutAudioFilesInput
    connect?: SessionWhereUniqueInput
  }

  export type DialogueCreateNestedOneWithoutAudioFileInput = {
    create?: XOR<DialogueCreateWithoutAudioFileInput, DialogueUncheckedCreateWithoutAudioFileInput>
    connectOrCreate?: DialogueCreateOrConnectWithoutAudioFileInput
    connect?: DialogueWhereUniqueInput
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableFloatFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type SessionUpdateOneRequiredWithoutAudioFilesNestedInput = {
    create?: XOR<SessionCreateWithoutAudioFilesInput, SessionUncheckedCreateWithoutAudioFilesInput>
    connectOrCreate?: SessionCreateOrConnectWithoutAudioFilesInput
    upsert?: SessionUpsertWithoutAudioFilesInput
    connect?: SessionWhereUniqueInput
    update?: XOR<XOR<SessionUpdateToOneWithWhereWithoutAudioFilesInput, SessionUpdateWithoutAudioFilesInput>, SessionUncheckedUpdateWithoutAudioFilesInput>
  }

  export type DialogueUpdateOneWithoutAudioFileNestedInput = {
    create?: XOR<DialogueCreateWithoutAudioFileInput, DialogueUncheckedCreateWithoutAudioFileInput>
    connectOrCreate?: DialogueCreateOrConnectWithoutAudioFileInput
    upsert?: DialogueUpsertWithoutAudioFileInput
    disconnect?: DialogueWhereInput | boolean
    delete?: DialogueWhereInput | boolean
    connect?: DialogueWhereUniqueInput
    update?: XOR<XOR<DialogueUpdateToOneWithWhereWithoutAudioFileInput, DialogueUpdateWithoutAudioFileInput>, DialogueUncheckedUpdateWithoutAudioFileInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type DialogueCreateWithoutSessionInput = {
    id?: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
    audioFile?: AudioFileCreateNestedOneWithoutDialogueInput
  }

  export type DialogueUncheckedCreateWithoutSessionInput = {
    id?: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
    audioFile?: AudioFileUncheckedCreateNestedOneWithoutDialogueInput
  }

  export type DialogueCreateOrConnectWithoutSessionInput = {
    where: DialogueWhereUniqueInput
    create: XOR<DialogueCreateWithoutSessionInput, DialogueUncheckedCreateWithoutSessionInput>
  }

  export type DialogueCreateManySessionInputEnvelope = {
    data: DialogueCreateManySessionInput | DialogueCreateManySessionInput[]
  }

  export type AudioFileCreateWithoutSessionInput = {
    id?: string
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
    dialogue?: DialogueCreateNestedOneWithoutAudioFileInput
  }

  export type AudioFileUncheckedCreateWithoutSessionInput = {
    id?: string
    dialogueId?: string | null
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
  }

  export type AudioFileCreateOrConnectWithoutSessionInput = {
    where: AudioFileWhereUniqueInput
    create: XOR<AudioFileCreateWithoutSessionInput, AudioFileUncheckedCreateWithoutSessionInput>
  }

  export type AudioFileCreateManySessionInputEnvelope = {
    data: AudioFileCreateManySessionInput | AudioFileCreateManySessionInput[]
  }

  export type DialogueUpsertWithWhereUniqueWithoutSessionInput = {
    where: DialogueWhereUniqueInput
    update: XOR<DialogueUpdateWithoutSessionInput, DialogueUncheckedUpdateWithoutSessionInput>
    create: XOR<DialogueCreateWithoutSessionInput, DialogueUncheckedCreateWithoutSessionInput>
  }

  export type DialogueUpdateWithWhereUniqueWithoutSessionInput = {
    where: DialogueWhereUniqueInput
    data: XOR<DialogueUpdateWithoutSessionInput, DialogueUncheckedUpdateWithoutSessionInput>
  }

  export type DialogueUpdateManyWithWhereWithoutSessionInput = {
    where: DialogueScalarWhereInput
    data: XOR<DialogueUpdateManyMutationInput, DialogueUncheckedUpdateManyWithoutSessionInput>
  }

  export type DialogueScalarWhereInput = {
    AND?: DialogueScalarWhereInput | DialogueScalarWhereInput[]
    OR?: DialogueScalarWhereInput[]
    NOT?: DialogueScalarWhereInput | DialogueScalarWhereInput[]
    id?: StringFilter<"Dialogue"> | string
    sessionId?: StringFilter<"Dialogue"> | string
    text?: StringFilter<"Dialogue"> | string
    character?: StringFilter<"Dialogue"> | string
    order?: IntFilter<"Dialogue"> | number
    createdAt?: DateTimeFilter<"Dialogue"> | Date | string
  }

  export type AudioFileUpsertWithWhereUniqueWithoutSessionInput = {
    where: AudioFileWhereUniqueInput
    update: XOR<AudioFileUpdateWithoutSessionInput, AudioFileUncheckedUpdateWithoutSessionInput>
    create: XOR<AudioFileCreateWithoutSessionInput, AudioFileUncheckedCreateWithoutSessionInput>
  }

  export type AudioFileUpdateWithWhereUniqueWithoutSessionInput = {
    where: AudioFileWhereUniqueInput
    data: XOR<AudioFileUpdateWithoutSessionInput, AudioFileUncheckedUpdateWithoutSessionInput>
  }

  export type AudioFileUpdateManyWithWhereWithoutSessionInput = {
    where: AudioFileScalarWhereInput
    data: XOR<AudioFileUpdateManyMutationInput, AudioFileUncheckedUpdateManyWithoutSessionInput>
  }

  export type AudioFileScalarWhereInput = {
    AND?: AudioFileScalarWhereInput | AudioFileScalarWhereInput[]
    OR?: AudioFileScalarWhereInput[]
    NOT?: AudioFileScalarWhereInput | AudioFileScalarWhereInput[]
    id?: StringFilter<"AudioFile"> | string
    sessionId?: StringFilter<"AudioFile"> | string
    dialogueId?: StringNullableFilter<"AudioFile"> | string | null
    filename?: StringFilter<"AudioFile"> | string
    filePath?: StringFilter<"AudioFile"> | string
    fileSize?: IntNullableFilter<"AudioFile"> | number | null
    duration?: FloatNullableFilter<"AudioFile"> | number | null
    generatedAt?: DateTimeFilter<"AudioFile"> | Date | string
    success?: BoolFilter<"AudioFile"> | boolean
    errorMessage?: StringNullableFilter<"AudioFile"> | string | null
  }

  export type SessionCreateWithoutDialoguesInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
    audioFiles?: AudioFileCreateNestedManyWithoutSessionInput
  }

  export type SessionUncheckedCreateWithoutDialoguesInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
    audioFiles?: AudioFileUncheckedCreateNestedManyWithoutSessionInput
  }

  export type SessionCreateOrConnectWithoutDialoguesInput = {
    where: SessionWhereUniqueInput
    create: XOR<SessionCreateWithoutDialoguesInput, SessionUncheckedCreateWithoutDialoguesInput>
  }

  export type AudioFileCreateWithoutDialogueInput = {
    id?: string
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
    session: SessionCreateNestedOneWithoutAudioFilesInput
  }

  export type AudioFileUncheckedCreateWithoutDialogueInput = {
    id?: string
    sessionId: string
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
  }

  export type AudioFileCreateOrConnectWithoutDialogueInput = {
    where: AudioFileWhereUniqueInput
    create: XOR<AudioFileCreateWithoutDialogueInput, AudioFileUncheckedCreateWithoutDialogueInput>
  }

  export type SessionUpsertWithoutDialoguesInput = {
    update: XOR<SessionUpdateWithoutDialoguesInput, SessionUncheckedUpdateWithoutDialoguesInput>
    create: XOR<SessionCreateWithoutDialoguesInput, SessionUncheckedCreateWithoutDialoguesInput>
    where?: SessionWhereInput
  }

  export type SessionUpdateToOneWithWhereWithoutDialoguesInput = {
    where?: SessionWhereInput
    data: XOR<SessionUpdateWithoutDialoguesInput, SessionUncheckedUpdateWithoutDialoguesInput>
  }

  export type SessionUpdateWithoutDialoguesInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
    audioFiles?: AudioFileUpdateManyWithoutSessionNestedInput
  }

  export type SessionUncheckedUpdateWithoutDialoguesInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
    audioFiles?: AudioFileUncheckedUpdateManyWithoutSessionNestedInput
  }

  export type AudioFileUpsertWithoutDialogueInput = {
    update: XOR<AudioFileUpdateWithoutDialogueInput, AudioFileUncheckedUpdateWithoutDialogueInput>
    create: XOR<AudioFileCreateWithoutDialogueInput, AudioFileUncheckedCreateWithoutDialogueInput>
    where?: AudioFileWhereInput
  }

  export type AudioFileUpdateToOneWithWhereWithoutDialogueInput = {
    where?: AudioFileWhereInput
    data: XOR<AudioFileUpdateWithoutDialogueInput, AudioFileUncheckedUpdateWithoutDialogueInput>
  }

  export type AudioFileUpdateWithoutDialogueInput = {
    id?: StringFieldUpdateOperationsInput | string
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    session?: SessionUpdateOneRequiredWithoutAudioFilesNestedInput
  }

  export type AudioFileUncheckedUpdateWithoutDialogueInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SessionCreateWithoutAudioFilesInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
    dialogues?: DialogueCreateNestedManyWithoutSessionInput
  }

  export type SessionUncheckedCreateWithoutAudioFilesInput = {
    id?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    name?: string | null
    exaggeration: number
    temperature: number
    seedNum: number
    cfgWeight: number
    minP: number
    topP: number
    repetitionPenalty: number
    totalDialogues?: number
    audioFilesGenerated?: number
    allSuccessful?: boolean
    dialogues?: DialogueUncheckedCreateNestedManyWithoutSessionInput
  }

  export type SessionCreateOrConnectWithoutAudioFilesInput = {
    where: SessionWhereUniqueInput
    create: XOR<SessionCreateWithoutAudioFilesInput, SessionUncheckedCreateWithoutAudioFilesInput>
  }

  export type DialogueCreateWithoutAudioFileInput = {
    id?: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
    session: SessionCreateNestedOneWithoutDialoguesInput
  }

  export type DialogueUncheckedCreateWithoutAudioFileInput = {
    id?: string
    sessionId: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
  }

  export type DialogueCreateOrConnectWithoutAudioFileInput = {
    where: DialogueWhereUniqueInput
    create: XOR<DialogueCreateWithoutAudioFileInput, DialogueUncheckedCreateWithoutAudioFileInput>
  }

  export type SessionUpsertWithoutAudioFilesInput = {
    update: XOR<SessionUpdateWithoutAudioFilesInput, SessionUncheckedUpdateWithoutAudioFilesInput>
    create: XOR<SessionCreateWithoutAudioFilesInput, SessionUncheckedCreateWithoutAudioFilesInput>
    where?: SessionWhereInput
  }

  export type SessionUpdateToOneWithWhereWithoutAudioFilesInput = {
    where?: SessionWhereInput
    data: XOR<SessionUpdateWithoutAudioFilesInput, SessionUncheckedUpdateWithoutAudioFilesInput>
  }

  export type SessionUpdateWithoutAudioFilesInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
    dialogues?: DialogueUpdateManyWithoutSessionNestedInput
  }

  export type SessionUncheckedUpdateWithoutAudioFilesInput = {
    id?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    exaggeration?: FloatFieldUpdateOperationsInput | number
    temperature?: FloatFieldUpdateOperationsInput | number
    seedNum?: IntFieldUpdateOperationsInput | number
    cfgWeight?: FloatFieldUpdateOperationsInput | number
    minP?: FloatFieldUpdateOperationsInput | number
    topP?: FloatFieldUpdateOperationsInput | number
    repetitionPenalty?: FloatFieldUpdateOperationsInput | number
    totalDialogues?: IntFieldUpdateOperationsInput | number
    audioFilesGenerated?: IntFieldUpdateOperationsInput | number
    allSuccessful?: BoolFieldUpdateOperationsInput | boolean
    dialogues?: DialogueUncheckedUpdateManyWithoutSessionNestedInput
  }

  export type DialogueUpsertWithoutAudioFileInput = {
    update: XOR<DialogueUpdateWithoutAudioFileInput, DialogueUncheckedUpdateWithoutAudioFileInput>
    create: XOR<DialogueCreateWithoutAudioFileInput, DialogueUncheckedCreateWithoutAudioFileInput>
    where?: DialogueWhereInput
  }

  export type DialogueUpdateToOneWithWhereWithoutAudioFileInput = {
    where?: DialogueWhereInput
    data: XOR<DialogueUpdateWithoutAudioFileInput, DialogueUncheckedUpdateWithoutAudioFileInput>
  }

  export type DialogueUpdateWithoutAudioFileInput = {
    id?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    session?: SessionUpdateOneRequiredWithoutDialoguesNestedInput
  }

  export type DialogueUncheckedUpdateWithoutAudioFileInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DialogueCreateManySessionInput = {
    id?: string
    text: string
    character: string
    order: number
    createdAt?: Date | string
  }

  export type AudioFileCreateManySessionInput = {
    id?: string
    dialogueId?: string | null
    filename: string
    filePath: string
    fileSize?: number | null
    duration?: number | null
    generatedAt?: Date | string
    success?: boolean
    errorMessage?: string | null
  }

  export type DialogueUpdateWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    audioFile?: AudioFileUpdateOneWithoutDialogueNestedInput
  }

  export type DialogueUncheckedUpdateWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    audioFile?: AudioFileUncheckedUpdateOneWithoutDialogueNestedInput
  }

  export type DialogueUncheckedUpdateManyWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    character?: StringFieldUpdateOperationsInput | string
    order?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AudioFileUpdateWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    dialogue?: DialogueUpdateOneWithoutAudioFileNestedInput
  }

  export type AudioFileUncheckedUpdateWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string
    dialogueId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AudioFileUncheckedUpdateManyWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string
    dialogueId?: NullableStringFieldUpdateOperationsInput | string | null
    filename?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSize?: NullableIntFieldUpdateOperationsInput | number | null
    duration?: NullableFloatFieldUpdateOperationsInput | number | null
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    success?: BoolFieldUpdateOperationsInput | boolean
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}