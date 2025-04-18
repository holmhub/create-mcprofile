# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.17](https://github.com/holmhub/create-mcprofile/compare/v0.0.16...v0.0.17) (2025-04-18)


### Bug Fixes

* **simple-map-analyzer:** improve path handling and add file existence check ([5a9a940](https://github.com/holmhub/create-mcprofile/commit/5a9a940c9f98a91123f6768b0a97fbaac1196c22))

### [0.0.16](https://github.com/holmityd/create-mcprofile/compare/v0.0.15...v0.0.16) (2025-04-17)


### Bug Fixes

* **extract:** ensure valid concurrency limit and simplify entry processing ([c9267d9](https://github.com/holmityd/create-mcprofile/commit/c9267d9cc8825c027790fe0120105121b8986116))
* **extract:** prevent zip-slip attacks by resolving and validating paths ([8b6df1b](https://github.com/holmityd/create-mcprofile/commit/8b6df1b49e86bf70974388d7108c926939d96cd5))

### [0.0.15](https://github.com/holmityd/create-mcprofile/compare/v0.0.14...v0.0.15) (2025-04-16)


### Features

* **forge:** add ForgeWrapper integration for modern Forge versions ([256929a](https://github.com/holmityd/create-mcprofile/commit/256929abe8cac9ae1e1cdc13a8a2c91bace9f7d6))
* **launch:** add DEFAULT_URLS constant and forge wrapper args ([34d0acb](https://github.com/holmityd/create-mcprofile/commit/34d0acb578c09845598a5ed5368ec5b6dbb29438))
* **types:** add new fields to IVersionManifest and ILibrary interfaces ([72fa5cf](https://github.com/holmityd/create-mcprofile/commit/72fa5cf7645ec97e57d20880ea0725161b7a430c))


### Bug Fixes

* **extract:** prevent zip-slip attacks by normalizing and verifying paths ([9f8ce83](https://github.com/holmityd/create-mcprofile/commit/9f8ce83086a92633c2b1a408349a433303a0338c))

### [0.0.14](https://github.com/holmityd/create-mcprofile/compare/v0.0.13...v0.0.14) (2025-04-13)


### Features

* add XML parsing and Forge loader support ([82449ec](https://github.com/holmityd/create-mcprofile/commit/82449ec2fce7201085fb2a199d52c29b576b5276))
* **cli:** add autocomplete functionality for directory and version selection ([3bdf86c](https://github.com/holmityd/create-mcprofile/commit/3bdf86c5cef791a24b28dc0e75bac345d2892256))

### [0.0.13](https://github.com/holmityd/create-mcprofile/compare/v0.0.12...v0.0.13) (2025-04-12)

### [0.0.12](https://github.com/holmityd/create-mcprofile/compare/v0.0.11...v0.0.12) (2025-04-12)


### Features

* **client:** add checksum validation for downloaded jar files ([c6e8377](https://github.com/holmityd/create-mcprofile/commit/c6e837712554cf1d0a69347fdddf24039d087c7b))

### [0.0.11](https://github.com/holmityd/create-mcprofile/compare/v0.0.10...v0.0.11) (2025-04-11)

### [0.0.10](https://github.com/holmityd/create-mcprofile/compare/v0.0.9...v0.0.10) (2025-04-10)


### Features

* **launcher:** add support for Fabric loader and refactor version handling ([20dfbbb](https://github.com/holmityd/create-mcprofile/commit/20dfbbb13eef678172d1ca8ee7c1a38e9ea428f5))

### 0.0.1 (2025-04-10)

### Features

* add default username handling in main function ([5bd9f07](https://github.com/holmityd/create-mcprofile/commit/5bd9f075a6b2493d329468812be5d1fc518889af))
* add interactive profile selection using selectFromList utility ([d300d55](https://github.com/holmityd/create-mcprofile/commit/d300d55826087ca1bc345830a4ffeed129f1caed))
* add mod loader selection and refactor folder retrieval logic ([11e89f1](https://github.com/holmityd/create-mcprofile/commit/11e89f103bea961e49d511f866544bb62e0cccc8))
* **cli:** add CLI for Minecraft launcher with settings and version management ([1fe6653](https://github.com/holmityd/create-mcprofile/commit/1fe6653dd1f54c3332759a0482d338dfc39d42b3))
* **cli:** add profile settings and game launch functionality ([d506899](https://github.com/holmityd/create-mcprofile/commit/d506899778368bba4196b6f4c2aa1f9d1db134d6))
* initialize project with basic structure and core functionality ([ef62cef](https://github.com/holmityd/create-mcprofile/commit/ef62cef0a483c4fed7615ddd93c7734c5e57e2b1))
* **launcher:** add Java version handling and download status event ([d04590f](https://github.com/holmityd/create-mcprofile/commit/d04590f73d2b35585977f7e6401d25da98d4f1cd))
* **progress:** add handleProgress utility for download progress visualization ([4e6789d](https://github.com/holmityd/create-mcprofile/commit/4e6789dd17083ea82509bc51713038281d604505))
* **utils:** add ZIP file decompression utility for client ([d21d61d](https://github.com/holmityd/create-mcprofile/commit/d21d61d1d53f0fe68a9d46437d59887c1bb84c66))
* **version:** add retry and fetch utilities for version handling ([b4b4868](https://github.com/holmityd/create-mcprofile/commit/b4b486838fac9fd23501bc4dd34364ecbc8d2b58))


### Bug Fixes

* **build:** correct input file path in compile script ([a3a85dd](https://github.com/holmityd/create-mcprofile/commit/a3a85dd3c15842a18b414e059ec1e4af6fdcb644))
* **launch:** set version type in options to ensure correct version handling ([0df26d8](https://github.com/holmityd/create-mcprofile/commit/0df26d8ea1298cb41a639fb906641b0604f2c1fc))
* **select:** clear last render and update output on selection ([a24e83f](https://github.com/holmityd/create-mcprofile/commit/a24e83ff37d2b7f998a2e838da2a59b5fe3dfed1))
