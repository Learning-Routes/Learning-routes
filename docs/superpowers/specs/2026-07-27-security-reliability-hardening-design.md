# Learning Routes Security and Reliability Hardening Design

**Date:** 2026-07-27

## Objective

Remove the currently known vulnerable Ruby dependencies, make audio file delivery
provably stay inside application-owned storage, add regression coverage for the
security boundary, and restore useful static-analysis feedback without a
repository-wide formatting rewrite.

## Current State

Learning Routes is a Rails 8.1 modular monolith with seven engines. The review
covered the application and engine source inventory, every Ruby file through a
syntax pass, controller authorization and file-I/O paths, JavaScript HTML sinks,
background-job concurrency patterns, dependency audits, and the existing CI
configuration.

The baseline Rails suite passes with 90 tests and 240 assertions. Brakeman reports
two weak-confidence file-access warnings, both caused by audio paths validated
with `String#start_with?`. Bundler Audit reports three vulnerable locked gems:

- `bcrypt 3.1.21`, patched in `3.1.22`;
- `mcp 0.8.0`, patched in `0.9.2`; this is a development dependency of RuboCop;
- `msgpack 1.8.0`, patched in `1.8.2`; this is a dependency of Bootsnap.

RuboCop reports 623 offenses. Most are caused by an inherited spacing convention
that conflicts with the repository's established no-inner-space array style.
Mass autocorrection would obscure the security changes and create unnecessary
review risk.

## Research Basis

The implementation follows these primary sources:

- The Rails Security Guide requires downloadable files to be checked against
  their expected directory:
  <https://guides.rubyonrails.org/security.html#file-downloads>
- Ruby documents that `Pathname#relative_path_from` is lexical and does not
  inspect the filesystem or resolve symlinks:
  <https://ruby-doc.org/core-3.1.2/Pathname.html#method-i-relative_path_from>
- Bundler documents targeted conservative updates and patch-level constraints:
  <https://bundler.io/man/bundle-update.1.html>
- The MCP advisory marks versions through 0.9.1 affected and 0.9.2 patched:
  <https://github.com/advisories/GHSA-qvqr-5cv7-wh35>
- The bcrypt advisory marks versions through 3.1.21 affected and 3.1.22 patched:
  <https://github.com/advisories/GHSA-f27w-vcwj-c954>
- RuboCop documents project-level enforcement of spacing styles:
  <https://docs.rubocop.org/rubocop/latest/cops_layout.html>

## Design

### 1. Audio Storage Boundary

Add `ContentEngine::AudioStorage` as the single boundary between stored audio
URLs and filesystem paths.

The boundary will:

- accept a stored URL and a named storage scope (`:audio` or `:sections`);
- reject blank values, NUL bytes, absolute paths outside the selected root,
  non-`.mp3` files, missing files, directories, and files below a caller-supplied
  minimum size;
- expand the candidate lexically and verify that its relative path from the
  selected root contains no `..` segment;
- resolve the real path for existing files and verify that it remains below the
  real storage root, preventing a symlink inside storage from escaping it;
- return a `Pathname` only when every check succeeds, otherwise return `nil`;
- expose safe deletion through the same validation boundary rather than letting
  controllers call `File.delete` directly.

The service will not accept arbitrary root paths from callers. Storage roots are
fixed constants derived from `Rails.root`.

### 2. Controller and Cache Integration

`ContentEngine::AudioController#show` will resolve full-lesson audio through the
`:audio` scope.

`ContentEngine::SectionAudioController#show` will resolve section audio through
the narrower `:sections` scope with the existing 1 KiB minimum. Invalid cached
entries will be evicted. Deletion of corrupt files will happen only through the
validated storage boundary.

`ContentEngine::SectionAudioGenerator.cached` will use the same resolver when
checking cache entries. Its disk fallback already constructs filenames from
server-owned identifiers and `File.basename`; that behavior remains, but the
selected result will still pass through the shared boundary.

Authorization behavior remains unchanged: a signed-in learner may access audio
only for a step belonging to that learner's route.

### 3. Dependency Remediation

Declare the minimum safe bcrypt patch release while retaining the existing
compatible series. Update only `bcrypt`, `mcp`, and `msgpack`, preferring patch
updates and conservative resolution. Inspect the lockfile diff and reject any
unrelated major or minor dependency movement unless required by the patched
dependency graph.

The implementation must leave:

- `bcrypt >= 3.1.22`;
- `mcp >= 0.9.2`;
- `msgpack >= 1.8.2`.

No new runtime dependency will be introduced for path validation.

### 4. Static-Analysis Signal

Configure `Layout/SpaceInsideArrayLiteralBrackets` to match the repository's
dominant no-inner-space convention. Do not blanket-disable RuboCop or generate a
large TODO file.

After the configuration correction, fix the remaining genuine alignment and
safe autocorrect issues only where they are directly reported. Formatting-only
changes will be kept separate from the security implementation in the diff.

Brakeman warnings will be resolved by code structure and tests, not ignored in
`.brakeman.ignore`.

### 5. Tests

Add focused tests for `AudioStorage`:

- valid lesson and section MP3 paths resolve;
- traversal paths are rejected;
- sibling-prefix paths such as `storage/audio-escape` are rejected;
- the wrong extension is rejected;
- missing, directory, and undersized files are rejected;
- a symlink escaping the storage root is rejected where the platform permits
  symlink creation;
- deletion removes only a validated file.

Add request/controller coverage for both audio endpoints:

- the owner receives a valid MP3 response;
- a different user receives `403`;
- missing or invalid stored paths receive `404`;
- invalid section cache entries are evicted;
- an invalid path is never deleted.

Tests will create temporary fixtures under the test storage tree and clean up
only the explicit files they create.

## Error Handling

An invalid or unavailable audio path is treated as a cache miss and returns
`404`; it does not expose the rejected path to the client. Expected validation
failures are not logged as application errors. Unexpected filesystem failures
are logged with the exception class and a non-sensitive categorical message.

Dependency or audit failures stop the implementation and are reported rather
than suppressed.

## Verification

The finished change must pass:

1. focused audio storage and controller tests;
2. the full Rails test suite;
3. `bundle exec brakeman --no-pager`;
4. `bundle exec bundler-audit check`;
5. `bin/importmap audit`;
6. `bin/rubocop`;
7. Rails eager loading in the test environment.

The known local optional OpenSlide/libvips warning will be reported separately
because it is a workstation package-linkage issue, not an application-code
failure.

## Out of Scope

- splitting the large Stimulus controllers;
- redesigning learning features or user-facing pages;
- replacing local audio storage with Active Storage or object storage;
- broad exception-handling refactors;
- repository-wide style rewrites;
- fixing the local Homebrew OpenSlide linkage.

Those are suitable follow-up projects after the security baseline is clean.
