# Phygital wallet program

The NFC accessory authorizes everyday wallet actions. A separate owner key manages
its permissions and allowances, and can make transactions outside those limits.

The program in this repository is **undeployed v2, policy version 8**.
After owner setup, its default is **No spending limits · Standard protections**.

- [Program overview](programs/phygital-wallet/README.md)
- [Accessory owner guide](programs/phygital-wallet/docs/accessory-owner-guide.md)
- [User expectation review](programs/phygital-wallet/docs/user-experience-review.md)
- [Integration reference](programs/phygital-wallet/docs/policy-reference.md)

Build and test from the repository root:

```sh
NO_DNA=1 anchor build
cp target/idl/phygital_wallet.json idl/phygital_wallet_v2.json
NO_DNA=1 cargo test -p phygital-wallet --tests
```

These commands build the program, refresh its v2 interface, and run local tests.
They do not deploy it. See the program overview before using other build scripts.
