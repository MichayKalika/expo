import { XcodeProject } from 'expo/config-plugins';

export function addPbxGroup(
  xcodeProject: XcodeProject,
  {
    targetName,
    widgetFiles,
  }: {
    targetName: string;
    widgetFiles: string[];
  }
) {
  if (xcodeProject.pbxGroupByName(targetName)) {
    return;
  }

  // Add PBX group
  const { uuid: pbxGroupUuid } = xcodeProject.addPbxGroup(
    Array.from(new Set([...widgetFiles, `${targetName}.entitlements`])),
    targetName,
    targetName
  );
  copyFileReferencesFromOtherGroups(xcodeProject, pbxGroupUuid);

  // Add PBXGroup to top level group
  const groups = xcodeProject.hash.project.objects['PBXGroup'];
  if (pbxGroupUuid) {
    Object.keys(groups).forEach(function (key) {
      if (groups[key]!.name === undefined && groups[key]!.path === undefined) {
        // @ts-expect-error: TODO(@kitten): This was untyped before and is now failing
        xcodeProject.addToPbxGroup(pbxGroupUuid, key);
      }
    });
  }
}

// `addPbxGroup` reuses any file reference with the same path, also one in the group of another
// target, such as the `Info.plist` of `expo-sharing`. Xcode 27 refuses a file reference that is in
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
