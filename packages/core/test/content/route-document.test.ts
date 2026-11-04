import { describe, expect, it } from "vitest";
import { MOST, problemsIn, routeDocumentJsonSchema } from "../../src/content/route-document";

// One document with a whole route in it (Platform STEP 5 §4), from a stranger's model: read
// as data, every problem named with its path, nothing fetched.

const NO_NETWORK_REF = /"\$ref":"https?:/;

const lesson = (blocks: unknown[] = [{ type: "concept", body: { es: "Hola" } }]) => ({
  title: { es: "Lección" },
  blocks,
});
const valid = (extra: Record<string, unknown> = {}) => ({
  slug: "mi-ruta",
  title: { es: "Mi ruta" },
  source_locale: "es",
  modules: [{ title: { es: "Módulo" }, lessons: [lesson()] }],
  ...extra,
});
const paths = (raw: unknown) => {
  const result = problemsIn(raw);
  return result.ok ? [] : result.problems.map((problem) => problem.split(":")[0]);
};

describe("a valid document", () => {
  it("is accepted", () => {
    expect(problemsIn(valid()).ok).toBe(true);
  });

  it("loses unknown fields, at every level, instead of keeping or refusing them", () => {
    const result = problemsIn({
      ...valid(),
      price: 100,
      __proto__x: 1,
      modules: [
        {
          title: { es: "M", xx: "no" },
          admin: true,
          lessons: [
            {
              title: { es: "L" },
              blocks: [
                {
                  type: "check",
                  question: { es: "¿Sí?" },
                  options: [{ label: { es: "Sí" }, correct: true, extra: 1 }],
                  hidden: "x",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    const text = JSON.stringify(result);
    for (const gone of ["price", "__proto__x", "admin", "hidden", "extra", '"xx"']) {
      expect(text).not.toContain(gone);
    }
  });
});

describe("an invalid document", () => {
  it("names every problem, with its path", () => {
    const found = paths({
      slug: "NOT A SLUG",
      title: { es: "T" },
      source_locale: "es",
      modules: [
        { title: { es: "M" }, lessons: [lesson()] },
        {
          title: {},
          lessons: [lesson(), lesson(), lesson(), lesson([{ type: "nada" }])],
        },
      ],
    });
    expect(found).toContain("slug");
    expect(found).toContain("modules[1].title");
    expect(found).toContain("modules[1].lessons[3].blocks[0].type");
  });

  it("stops at 50 problems", () => {
    const blocks = Array.from({ length: 80 }, () => ({ type: "nada" }));
    expect(
      paths(valid({ modules: [{ title: { es: "M" }, lessons: [lesson(blocks)] }] })),
    ).toHaveLength(50);
  });

  it("refuses what is not an object at all", () => {
    expect(problemsIn("texto").ok).toBe(false);
    expect(problemsIn(null).ok).toBe(false);
    expect(problemsIn([]).ok).toBe(false);
  });

  it("needs the title in the source locale", () => {
    expect(paths(valid({ title: { en: "T" } }))).toContain("title");
  });
});

describe("the limits", () => {
  const manyModules = Array.from({ length: MOST.modules + 1 }, () => ({
    title: { es: "M" },
    lessons: [],
  }));

  it("refuses too many modules, lessons or blocks", () => {
    expect(paths(valid({ modules: manyModules }))).toContain("modules");
    const lessons = Array.from({ length: MOST.lessons + 1 }, () => lesson([]));
    expect(paths(valid({ modules: [{ title: { es: "M" }, lessons }] }))).toContain("modules");
    const blocks = Array.from({ length: MOST.blocks + 1 }, () => ({
      type: "tip",
      body: { es: "x" },
    }));
    expect(
      paths(valid({ modules: [{ title: { es: "M" }, lessons: [lesson(blocks)] }] })),
    ).toContain("modules");
  });

  it("refuses a giant string", () => {
    const giant = { type: "concept", body: { es: "x".repeat(MOST.textLength + 1) } };
    expect(paths(valid({ modules: [{ title: { es: "M" }, lessons: [lesson([giant])] }] }))).toEqual(
      ["modules[0].lessons[0].blocks[0].body.es"],
    );
    expect(paths(valid({ title: { es: "x".repeat(MOST.titleLength + 1) } }))).toContain("title.es");
  });
});

describe("links and media", () => {
  const withBlock = (block: unknown) =>
    valid({ modules: [{ title: { es: "M" }, lessons: [lesson([block])] }] });

  it("takes media only from an https address", () => {
    const good = { type: "audio", audio_url: "https://cdn.example.test/a.mp3" };
    expect(problemsIn(withBlock(good)).ok).toBe(true);
    for (const audio_url of [
      "http://cdn.example.test/a.mp3",
      "javascript:alert(1)",
      "data:audio/mp3;base64,AAAA",
      "/local.mp3",
    ]) {
      expect(paths(withBlock({ type: "audio", audio_url }))).toEqual([
        "modules[0].lessons[0].blocks[0].audio_url",
      ]);
    }
  });

  it("refuses a link in text that is not https", () => {
    for (const body of [
      "[pulsa](javascript:alert(1))",
      "[pulsa]( JAVASCRIPT:alert(1))",
      "[pulsa](http://example.test)",
      '<a href="javascript:alert(1)">pulsa</a>',
      "![x](data:image/png;base64,AAAA)",
    ]) {
      expect(paths(withBlock({ type: "concept", body: { es: body } })), body).toEqual([
        "modules[0].lessons[0].blocks[0].body.es",
      ]);
    }
    const fine = { type: "concept", body: { es: "[bien](https://example.test)" } };
    expect(problemsIn(withBlock(fine)).ok).toBe(true);
  });

  it("keeps a script tag as the words it is, for the page to escape", () => {
    const body = "<script>alert(1)</script>";
    const result = problemsIn(valid({ title: { es: body } }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.document.title.es).toBe(body);
  });

  it("does not read code as text", () => {
    const code = { type: "code_playground", language: "js", code: "a[0](javascript:b)" };
    expect(problemsIn(withBlock(code)).ok).toBe(true);
  });
});

describe("its JSON Schema", () => {
  it("is generated from the same rules, with no address to fetch", () => {
    const schema = routeDocumentJsonSchema();
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
    const text = JSON.stringify(schema);
    expect(text).toContain("code_playground");
    expect(text).not.toMatch(NO_NETWORK_REF);
  });
});
