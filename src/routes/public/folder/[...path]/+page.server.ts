import type { PageServerLoad } from './$types';
import { getPublicFolderByPath } from '$lib/telegramStorage';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const folderPath = params.path;
  const result = await getPublicFolderByPath(folderPath);
  if (!result) throw error(404, 'Folder not found or not public');
  return {
    folder:     result.folder,
    files:      result.files,
    subfolders: result.subfolders,
    folderPath,
  };
};
