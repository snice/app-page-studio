import { authApi } from './auth';
import { pagesApi } from './pages';
import { htmlApi } from './html';
import { promptApi } from './prompt';
import { projectsApi } from './projects';
import { usersApi } from './users';
import { figmaApi } from './figma';

export const api = {
  ...authApi,
  ...pagesApi,
  ...htmlApi,
  ...promptApi,
  ...projectsApi,
  ...usersApi,
  ...figmaApi,
};

export { authApi, pagesApi, htmlApi, promptApi, projectsApi, usersApi, figmaApi };
