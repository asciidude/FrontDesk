# FrontDesk
FrontDesk is an open-source ticketing utility bot designed around [Yapper](https://yapper.website)'s API.

It is made for ease-of-use, customizability, and safety.

## Support Server
You can join our community/support server [here](https://yapin.gg/invite/qaFqK6zVXp).

# Dependencies
FrontDesk depends on the following libraries:
* yapper.js - the SDK obtained from [Yapper Developers](https://www.yapper.website/developers), placed in `dependencies` - modified to support TypeScript cogs.
* sqlite - the database FrontDesk runs on, local

# Running your own instance
You are allowed to run your own instance of FrontDesk **given you do not use it's name or assets (logo, banners, etc.) in commercial or hobbyist use.**

In order to do so:
1. Create a `.env` file containing all the information that `.env.TEMPLATE` requests. This is crucial.
2. **If you are not using Bun:**
    - update tsconfig to remove `"types": ["bun-types"]` and install the `dotenv` package, importing it in the TypeScript file.
    - update any assets in `/assets` with **your own** logo, banner, etc.
    - update package.json to run start/dev scripts with node and nodemon.
3. Run the bot using `npm run start` or `npm run dev`


# License
The FrontDesk **source code** is licensed under the MIT License.

You may use, copy, modify, distribute, sublicense, and sell copies of the software, subject to the terms of that license.

The MIT License applies to the software code, not to project branding, logos, or other assets that are separately identified as excluded from the license.

Third-party dependencies remain subject to their respective licenses.

# Copyright
Copyright (C) asciixd. All rights reserved.