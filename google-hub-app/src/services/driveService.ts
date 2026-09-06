/**
 * 4. Drive機能
 * ファイル/フォルダの一覧・検索・並び替え・プレビュー・共有設定変更・移動。
 * Advanced Drive Service は使わず、DriveApp のみで完結させる（有効化不要・スコープ最小化）。
 */
namespace DriveService {
  export type SortKey = "name" | "updated" | "size";

  const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

  /** Google純正の「third-party icon」規則に沿ったアイコンURLを組み立てる（API呼び出し不要の純粋関数） */
  export function iconUrlForMimeType(mimeType: string, isFolder: boolean): string {
    if (isFolder) {
      return "https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.folder";
    }
    return "https://drive-thirdparty.googleusercontent.com/16/type/" + encodeURIComponent(mimeType);
  }

  interface DriveEntryLike {
    getId(): string;
    getName(): string;
    getUrl(): string;
    getLastUpdated(): GoogleAppsScript.Base.Date;
    getSize(): number;
    getSharingAccess(): GoogleAppsScript.Drive.Access;
  }

  function toItem(entry: DriveEntryLike, mimeType: string, isFolder: boolean): DriveFileItem {
    let sharingAccess = "UNKNOWN";
    try {
      sharingAccess = String(entry.getSharingAccess());
    } catch (e) {
      // 権限不足等で取得できない場合は UNKNOWN のまま
    }
    return {
      id: entry.getId(),
      name: entry.getName(),
      mimeType: mimeType,
      iconUrl: iconUrlForMimeType(mimeType, isFolder),
      thumbnailUrl: "",
      url: entry.getUrl(),
      lastUpdated: entry.getLastUpdated().toISOString(),
      sizeBytes: isFolder ? 0 : entry.getSize(),
      isFolder: isFolder,
      sharingAccess: sharingAccess,
    };
  }

  function fileToItem(file: GoogleAppsScript.Drive.File): DriveFileItem {
    return toItem(file, file.getMimeType(), false);
  }

  function folderToItem(folder: GoogleAppsScript.Drive.Folder): DriveFileItem {
    return toItem(folder, FOLDER_MIME_TYPE, true);
  }

  export function sortItems(items: DriveFileItem[], sortKey: SortKey, ascending: boolean): DriveFileItem[] {
    const sorted = items.slice().sort((a, b) => {
      let compared = 0;
      if (sortKey === "name") {
        compared = a.name.localeCompare(b.name, "ja");
      } else if (sortKey === "updated") {
        compared = a.lastUpdated < b.lastUpdated ? -1 : a.lastUpdated > b.lastUpdated ? 1 : 0;
      } else if (sortKey === "size") {
        compared = a.sizeBytes - b.sizeBytes;
      }
      return ascending ? compared : -compared;
    });
    return sorted;
  }

  /** フォルダ直下（未指定時はマイドライブ直下）の一覧。フォルダ優先で返す */
  export function listFiles(
    folderId: string | null,
    sortKey: SortKey = "updated",
    ascending: boolean = false,
    limit: number = 100
  ): DriveFileItem[] {
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const items: DriveFileItem[] = [];

    const folderIterator = folder.getFolders();
    while (folderIterator.hasNext() && items.length < limit) {
      items.push(folderToItem(folderIterator.next()));
    }
    const fileIterator = folder.getFiles();
    while (fileIterator.hasNext() && items.length < limit) {
      items.push(fileToItem(fileIterator.next()));
    }
    return sortItems(items, sortKey, ascending);
  }

  export function searchFiles(query: string, limit: number = 50): DriveFileItem[] {
    const escaped = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const searchQuery = "title contains '" + escaped + "' and trashed = false";
    const iterator = DriveApp.searchFiles(searchQuery);
    const items: DriveFileItem[] = [];
    while (iterator.hasNext() && items.length < limit) {
      items.push(fileToItem(iterator.next()));
    }
    return items;
  }

  export function getPreviewUrl(fileId: string): string {
    const file = DriveApp.getFileById(fileId);
    return "https://drive.google.com/file/d/" + file.getId() + "/preview";
  }

  const ACCESS_MAP: { [key: string]: GoogleAppsScript.Drive.Access } = {
    ANYONE: DriveApp.Access.ANYONE,
    ANYONE_WITH_LINK: DriveApp.Access.ANYONE_WITH_LINK,
    DOMAIN: DriveApp.Access.DOMAIN,
    DOMAIN_WITH_LINK: DriveApp.Access.DOMAIN_WITH_LINK,
    PRIVATE: DriveApp.Access.PRIVATE,
  };

  const PERMISSION_MAP: { [key: string]: GoogleAppsScript.Drive.Permission } = {
    VIEW: DriveApp.Permission.VIEW,
    EDIT: DriveApp.Permission.EDIT,
    COMMENT: DriveApp.Permission.COMMENT,
    NONE: DriveApp.Permission.NONE,
  };

  export function updateSharing(fileId: string, access: string, permission: string): DriveFileItem {
    const file = DriveApp.getFileById(fileId);
    const accessEnum = ACCESS_MAP[access];
    const permissionEnum = PERMISSION_MAP[permission];
    if (!accessEnum || !permissionEnum) {
      throw new Error("不正な共有設定です: access=" + access + ", permission=" + permission);
    }
    file.setSharing(accessEnum, permissionEnum);
    return fileToItem(file);
  }

  export function moveFile(fileId: string, destinationFolderId: string): DriveFileItem {
    const file = DriveApp.getFileById(fileId);
    const destination = DriveApp.getFolderById(destinationFolderId);
    const parents = file.getParents();
    while (parents.hasNext()) {
      const parent = parents.next();
      parent.removeFile(file);
    }
    destination.addFile(file);
    return fileToItem(file);
  }
}
