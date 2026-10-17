# Dependency Compatibility

Frameworks such as ESP-ADF and ESP-SR pin the ESP-IDF versions they support. Passing one check does not prove a combination works, so record what you verified and say what you did not.

## Rule

For each framework in the stack, write down its exact version (tag or commit), the exact IDF version, and where the compatibility evidence came from. If an edge has no evidence, build with it if the user wants to, and list it under "not verified" in the report. Do not present a guess as a result.

## Evidence ladder

1. **Project lock record.** A checked-in file with exact versions and proof sources ([example](../templates/compat/esp-framework-compat.lock.example)). Best for repeat builds.
2. **Official matrices and release notes.** ESP-ADF's README compatibility matrix (read the row for the ADF release and the column for the exact IDF release), ESP-ADF release notes, and ESP-SKAINET bundle docs for ESP-SR plus audio stacks.
3. **Component manifests.** `idf_component.yml` `dependencies.idf` ranges, and the resolved versions in `dependencies.lock`. A manifest range shows a component against IDF. It does not show two components against each other.
4. **A local build.** A clean build with the exact versions, or a sample example, is useful evidence. Record it after the upstream evidence, not instead of it when a matrix exists.

If the matrix does not list the IDF release in use, support is unproven. Do not assume forward compatibility.

## Common stacks

- **IDF + ADF.** Record both versions. Check the ADF matrix row and column for your IDF release.
- **IDF + SR.** Record both. Check that `esp-sr/idf_component.yml` `dependencies.idf` includes your IDF version, plus the chip and PSRAM notes in the SR docs.
- **IDF + ADF + SR.** Pass both checks above, and add cross-stack evidence (a lock record, an SKAINET bundle reference, or a tested matrix from the user). Do not infer it from two separate checks.

Example of an unproven stack: the ADF matrix tops out at one IDF release, the project uses a newer one, and the SR manifest allows it. The SR check passes, and the ADF edge is still missing.

## How to gather it

Read the manifests and READMEs in the checkout (`rg` for `idf` in `idf_component.yml`, open the ADF README matrix). Fetching upstream pages for newer information is fine when the user's setup allows network use. Pin whatever you used by version or commit in the record, not by branch name.

## Review checklist

- Every framework has an exact version recorded.
- Each has evidence against the exact IDF version.
- Cross-stack evidence exists where frameworks interact, or the gap is reported.
- No "probably compatible" remains unlabeled.
