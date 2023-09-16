import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ImageListItem, { imageListItemClasses } from '@mui/material/ImageListItem';
import ImageListItemBar from '@mui/material/ImageListItemBar';
import Stack from '@mui/material/Stack';
import Avatar from 'components/global/avatar';
import FakeLink from 'components/global/fakelink';
import { supabase, SUPABASE_SHADERTHUMB_BUCKET_NAME } from 'lib/db/supabaseclient';
import { getFullyQualifiedSupabaseBucketURL } from 'lib/util/urlutils';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { Item, theme } from 'theme/theme';

export const SHADERS_PER_PAGE = 12;
export const SHADER_THUMB_SIZE_H = 256;
export const SHADER_THUMB_SIZE_V = 144;

export const getPagination = (page: number, size: number) => {
    const from = page * size;
    const to = from + size - 1;
    return { from, to };
};

const getTotalCount = async () => {
    const { error, count } = await supabase
        .from('shader')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public');

    return error ? 0 : count;
};

export async function getServerSideProps(context) {
    context.res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=59');

    const { from, to } = getPagination(context.params.page, SHADERS_PER_PAGE);
    const { data, count, error } = await supabase
        .from('shader')
        .select(
            `
            id,
            name,
            profile:author (
                username,
                avatar_url
            ),
            thumb_url
        `
        )
        .order('created_at', { ascending: false })
        .range(from, to)
        .eq('visibility', 'public');

    const totalCount = await getTotalCount();

    return {
        props: {
            shaders: data ?? [],
            pageCount: count,
            totalCount: totalCount,
            error: error,
            page: context.params.page
        }
    };
}

const ShaderPicker = props => {
    return (
        <Item
            elevation={12}
            sx={{
                display: 'inline-block'
            }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'repeat(1, 1fr)',
                        sm: 'repeat(2, 1fr)',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(4, 1fr)'
                    },
                    gap: '10px',
                    // standard variant from here:
                    // https://github.com/mui-org/material-ui/blob/3e679ac9e368aeb170d564d206d59913ceca7062/packages/mui-material/src/ImageListItem/ImageListItem.js#L42-L43
                    [`& .${imageListItemClasses.root}`]: {
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                {props.shaders.map(shader => (
                    <ImageListItem key={shader.id}>
                        <Link passHref href={`/view/${shader.id}`}>
                            <Image
                                style={{ borderRadius: '4px', cursor: "pointer" }}
                                src={getFullyQualifiedSupabaseBucketURL(
                                    SUPABASE_SHADERTHUMB_BUCKET_NAME,
                                    shader.thumb_url
                                )}
                                alt={shader.name}
                                width={SHADER_THUMB_SIZE_H}
                                height={SHADER_THUMB_SIZE_V}
                                priority={true}
                            />
                        </Link>
                        <ImageListItemBar
                            title={<Link href={`/view/${shader.id}`}>{shader.name}</Link>}
                            subtitle={
                                <div>
                                    <span>by </span>
                                    <FakeLink href={`/profile/${shader.profile.username}`}>
                                        {shader.profile.username}
                                    </FakeLink>
                                </div>
                            }
                            style={{ borderRadius: '4px' }}
                            actionIcon={
                                <FakeLink href={`/profile/${shader.profile.username}`}>
                                    <Box sx={{ margin: '10px' }}>
                                        <Avatar url={shader.profile.avatar_url} size={25} />
                                    </Box>
                                </FakeLink>
                            }
                        />
                    </ImageListItem>
                ))}
            </Box>
        </Item>
    );
};

export const MAX_PAGE_BUTTONS = 5;

const PageButton = props => {
    return (
        <Link href={`/list/${props.index}`} passHref>
            <Button>
                <span
                    style={
                        props.highlight
                            ? { color: theme.palette.dracula.foreground }
                            : { color: theme.palette.dracula.selection }
                    }
                >
                    {props.index.toString()}
                </span>
            </Button>
        </Link>
    );
};

const EllipsisButton = () => {
    return <Button>{'...'}</Button>;
};

/*
    The cryptic math here handles the various cases for rendering
    the page picker. For example on page 0 it may look like:
    0   1   2   3   4   ...  12

    On page 1 we want to show (at least) one previous page for
    navigating back (i.e. it's the same as page 0:
    0   1   2   3   4   ...  12

    On page 2 we move forward:
    1   2   3   4   5   ...  12

    In this example, page 8 is the first where we can display all
    pages in the picker at once (we remove the ellipsis):
    7   8   9   10  11  12

    There's no sense in continuing to make the list smaller at this
    point, so we clamp the range here.

 */
const PagePicker = props => {
    const pages = Math.floor((parseInt(props.totalCount) - 1) / SHADERS_PER_PAGE);

    const currentPage = props.page;

    const maxFirstPage = Math.max(0, pages - (MAX_PAGE_BUTTONS - 1));

    const firstPage = Math.min(Math.max(0, currentPage - 1), maxFirstPage);

    const lowerPages = Math.min(pages - firstPage, MAX_PAGE_BUTTONS);

    const lastPage = pages;

    const showLast = pages > lowerPages;

    const hideEllipsis = maxFirstPage <= currentPage;

    // trick to do python-style range() iterator
    return (
        <Stack direction="row" style={props.style}>
            {[...Array(lowerPages).keys()].map(index => {
                const page = index + firstPage;
                return <PageButton highlight={currentPage === page} key={page} index={page} />;
            })}
            {showLast ? (
                <Fragment>
                    {!hideEllipsis ? <EllipsisButton /> : null}
                    <PageButton
                        highlight={currentPage === lastPage}
                        key={lastPage}
                        index={lastPage}
                    />
                </Fragment>
            ) : null}
        </Stack>
    );
};

export default function ShaderList(props) {
    return (
        <Fragment>
            <Box
                sx={{
                    display: 'inline-block',
                    position: 'relative',
                    left: '50%',
                    transform: 'translate(-50%, 0)'
                }}
            >
                <PagePicker
                    page={props.page}
                    totalCount={props.totalCount}
                    style={{ marginBottom: '10px' }}
                />
                <ShaderPicker page={props.page} shaders={props.shaders} />
            </Box>
        </Fragment>
    );
}
