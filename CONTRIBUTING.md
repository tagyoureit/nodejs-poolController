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

* By submitting any changes, you agree that any contributions provided will become the sole property of the Copyright holders subject to the terms below.  
    1. Definitions.

    "You" (or "Your") shall mean the copyright owner or legal entity authorized by the copyright owner that is making this Agreement with Russell Goldin. For legal entities, the entity making a Contribution and all other entities that control, are controlled by, or are under common control with that entity are considered to be a single Contributor. For the purposes of this definition, "control" means (i) the power, direct or indirect, to cause the direction or management of such entity, whether by contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the outstanding shares, or (iii) beneficial ownership of such entity.

    "Contribution" shall mean any original work of authorship, including any modifications or additions to an existing work, that is intentionally submitted by You to Russell Goldin for inclusion in, or documentation of, any of the products owned or managed by Russell Goldin (the "Work"). For the purposes of this definition, "submitted" means any form of electronic, verbal, or written communication sent to Russell Goldin or its representatives, including but not limited to communication on electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, Russell Goldin for the purpose of discussing and improving the Work, but excluding communication that is conspicuously marked or otherwise designated in writing by You as "Not a Contribution."

    2. Grant of Copyright License. Subject to the terms and conditions of this Agreement, You hereby grant to Russell Goldin and to recipients of software distributed by Russell Goldin a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute Your Contributions and such derivative works.

    3. Grant of Patent License. Subject to the terms and conditions of this Agreement, You hereby grant to Russell Goldin and to recipients of software distributed by Russell Goldin a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this section) patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work, where such license applies only to those patent claims licensable by You that are necessarily infringed by Your Contribution(s) alone or by combination of Your Contribution(s) with the Work to which such Contribution(s) was submitted. If any entity institutes patent litigation against You or any other entity (including a cross-claim or counterclaim in a lawsuit) alleging that your Contribution, or the Work to which you have contributed, constitutes direct or contributory patent infringement, then any patent licenses granted to that entity under this Agreement for that Contribution or Work shall terminate as of the date such litigation is filed.

    4. You represent that you are legally entitled to grant the above license. If your employer(s) has rights to intellectual property that you create that includes your Contributions, you represent that you have received permission to make Contributions on behalf of that employer, that your employer has waived such rights for your Contributions to Russell Goldin, or that your employer has executed a separate Corporate CLA with Russell Goldin.

    5. You represent that each of Your Contributions is Your original creation (see section 7 for submissions on behalf of others). You represent that Your Contribution submissions include complete details of any third-party license or other restriction (including, but not limited to, related patents and trademarks) of which you are personally aware and which are associated with any part of Your Contributions.

    6. You are not expected to provide support for Your Contributions, except to the extent You desire to provide support. You may provide support for free, for a fee, or not at all. Unless required by applicable law or agreed to in writing, You provide Your Contributions on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON- INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE.

    7. Should You wish to submit work that is not Your original creation, You may submit it to Russell Goldin separately from any Contribution, identifying the complete details of its source and of any license or other restriction (including, but not limited to, related patents, trademarks, and license agreements) of which you are personally aware, and conspicuously marking the work as "Submitted on behalf of a third-party: [named here]".

    8. You agree to notify Russell Goldin of any facts or circumstances of which you become aware that would make these representations inaccurate in any respect.
      
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
