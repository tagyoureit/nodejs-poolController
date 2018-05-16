# How to contribute

Third-party patches are essential for keeping nodejs-poolController great. We
simply can't access the huge number of platforms and myriad configurations for
running different pools and their equipment. We want to keep it as easy as
possible to contribute changes that get things working in your environment.
There are a few guidelines that we need contributors to follow so that we can
have a chance of keeping on top of things.


## Getting Started

* Make sure you have a [GitHub account](https://github.com/signup/free)
* Submit a ticket for your issue, assuming one does not already exist.
  * Clearly describe the issue including steps to reproduce when it is a bug.
  * Make sure you fill in the earliest version that you know has the issue.
* Fork the repository on GitHub

## Making Changes

* Create a topic branch from where you want to base your work.
  * This is usually the master branch.
  * Only target release branches if you are certain your fix must be on that
    branch.
  * To quickly create a topic branch based on master; `git checkout -b
    fix/master/my_contribution master`. Please avoid working directly on the
    `master` branch.
* Make commits of logical units.
* Check for unnecessary whitespace with `git diff --check` before committing.

* Make sure you have added the necessary tests for your changes.
* Run _all_ the tests to assure nothing else was accidentally broken.

## Submitting Changes

* Electronically sign the [Contributor License Agreement]
(https://github.com/tagyoureit/nodejs-poolController/blob/master/CONTRIBUTING.md) by either:
  1. Submitting a Pull Request stating you agree to the terms of the CLA.
  1. Email a copy to russ.goldin@gmail.com for approval
* Push your changes to a topic branch in your fork of the repository.
* Submit a pull request to the repository.
* The core team looks at Pull Requests on a regular basis.

## Revert Policy
By running tests in advance and by engaging with peer review for prospective
changes, your contributions have a high probability of becoming long lived
parts of the the project. After being merged, the code will run through a
series of testing pipelines on a large number of operating system
environments. These pipelines can reveal incompatibilities that are difficult
to detect in advance.

If the code change results in a test failure, we will make our best effort to
correct the error.


### Summary
* Changes resulting in failures will be reverted.
