# Cover Image Picker
An Obsidian community plugin

## Aim
Easily allow selecting an image into YAML frontmatter properties and optimize image storage. Needs to also work on iOS.

## Detailled specs
When creating a note in Obsidian certain plugins allow the display of a cover or banner image based on certain YAML frontmatter properties. However there is no easy way to directly select or paste an image in to YAML frontmatter, especially on iOS. The proposed workflow thus should encompass two distinct operations:
- Image Selection: When using the Live Preview mode and clicking into an existing frontmatter property no image selection tool is available (the regular edit menu is available in source mode). This should be changed and allow for an image selection mode.
On Desktop: We should be able to drag & drop images into the frontmatter.
On Mobile: Since we do not want to interfere with normal text edit capabilities, there should be an unintrusive menu on mobile on the bottom that allows for image add (just like the regular menu on mobile) which gives access to the galery or the device camera. When using source mode we need a smart solution that does not interfere with the general edit menu but extends or replaces the image-add capabilities.
For both: We can use the plugin options to limit the behavior only to certain frontmatter properties based on their names, if possible (e.g. cover, banner, etc.), to be set by the user.
- Image processing: I would like to process the image upon insertion so the file stored in the vault can be renamed, resized and processed. For this we need to be able to set a default storage location (root folder, specific folder or with note in same folder), a renaming scheme with a good default (e.g. noteName_propertyName or something like this), a resize spec (e.g. fixed width and height with either stretch or fill, only fixed width or only fixed height) and a processing strategy (e.g. WebP with quality of 75 or png).

## User Journey
### Desktop
Drag and drop an image into the YAML frontmatter, the image is resized, renamed, processed and stored in the specified folder and the correct link is entered into the frontmatter property field.
### Mobile (iOS)
Click into the frontmatter property in Live Preview mode. The menu appears on the bottom just like when editing the note body but only with the relevant image insertion symbol. Upon clicking an image can be selected from the gallery, files or live camera (just like the general obsidian menu). The image is then resized, renamed, processed and stored in the specified folder and the correct link is entered into the frontmatter property field. On Source mode either a new icon needs to be added to the menu or the exisiting image add adapted with the new behavior.

## Do
The implementation should be lightweight and performant and use stable and established components where possible.

## Do not do
We do not want to alter general file or edit behavior and restrict the new capabilities stricly to the frontmatter and even only to specific properties if set in the options.

## MVP
The first mvp should focus only on insertion from gallery (no camera access on mobile) and only Preview mode. The file handling options should be limited to one processing format (WebP).
