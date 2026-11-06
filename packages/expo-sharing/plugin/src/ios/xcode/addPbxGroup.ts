import { XcodeProject } from '@expo/config-plugins';
import path from 'path';

import { getSharedFilesPath } from '../../utils';
import { ShareExtensionFiles } from '../setupShareExtensionFiles';

export function addPbxGroup(
  xcodeProject: XcodeProject,
  targetName: string,
  shareExtensionFiles: ShareExtensionFiles,
  platformProjectRoot: string
) {
  const sharedFilesPath = getSharedFilesPath();

  const targetFiles = Object.values({
    ...shareExtensionFiles,
    sharedFiles: [],
  }).flat();

  // Add generated files
  targetFiles.push(`${targetName}.entitlements`);
  targetFiles.push(`Info.plist`);

  const sharedFiles = Object.values(shareExtensionFiles.sharedFiles ?? [])
    .flat()
    .map((file) => path.join(sharedFilesPath, file))
    .map((file) => path.relative(path.join(platformProjectRoot, targetName, 'shared'), file));

  const { uuid: mainGroupUuid } = xcodeProject.addPbxGroup(targetFiles, targetName, targetName);
  copyFileReferencesFromOtherGroups(xcodeProject, mainGroupUuid);
  const { uuid: sharedGroupUuid } = xcodeProject.addPbxGroup(sharedFiles, 'shared', 'shared');

  if (mainGroupUuid && sharedGroupUuid) {
    // @ts-expect-error: TODO(@kitten): This used to be untyped, and is failing now
    xcodeProject.addToPbxGroup(sharedGroupUuid, mainGroupUuid);
  }

  const groups = xcodeProject.hash.project.objects['PBXGroup'];
  if (mainGroupUuid) {
    Object.keys(groups).forEach((key) => {
      if (!groups[key]!.name && !groups[key]!.path) {
        // @ts-expect-error: TODO(@kitten): This used to be untyped, and is failing now
        xcodeProject.addToPbxGroup(mainGroupUuid, key);
      }
    });
  }
}

// `addPbxGroup` reuses any file reference with the same path, also one in the group of another
// target, such as the `Info.plist` of `expo-widgets`. Xcode 27 refuses a file reference that is in
// more than one group.
function copyFileReferencesFromOtherGroups(xcodeProject: XcodeProject, groupUuid: string) {
  const { PBXGroup: groups, PBXFileReference: fileReferences } = xcodeProject.hash.project.objects;
  const fileReferencesInOtherGroups = new Set(
    Object.entries(groups)
      .filter(([key, group]) => key !== groupUuid && typeof group === 'object')
      .flatMap(([, group]) => group.children.map(({ value }: { value: string }) => value))
  );

  for (const child of groups[groupUuid]!.children) {
    if (fileReferences[child.value] && fileReferencesInOtherGroups.has(child.value)) {
      const uuid = xcodeProject.generateUuid();
      fileReferences[uuid] = { ...fileReferences[child.value]! };
      fileReferences[`${uuid}_comment`] = fileReferences[`${child.value}_comment`]!;
      child.value = uuid;
    }
  }
}
