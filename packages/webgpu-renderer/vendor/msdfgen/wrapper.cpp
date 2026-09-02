#include "upstream/msdfgen.h"

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace {

constexpr std::uint32_t ABI_VERSION = 1;
constexpr std::uint32_t MAX_DIMENSION = 8192;
constexpr std::uint32_t MAX_EDGE_COUNT = 1u << 20;
constexpr double ENDPOINT_EPSILON = 1e-9;

enum Status : std::uint32_t {
    STATUS_OK = 0,
    STATUS_ABI_MISMATCH = 1,
    STATUS_INVALID_ARGUMENT = 2,
    STATUS_INVALID_CONTOURS = 3,
    STATUS_INVALID_EDGE_KIND = 4,
    STATUS_INVALID_SHAPE = 5,
    STATUS_OUTPUT_TOO_SMALL = 6,
};

enum EdgeKind : std::uint32_t {
    EDGE_LINE = 1,
    EDGE_QUADRATIC = 2,
    EDGE_CUBIC = 3,
};

bool finitePoint(const msdfgen::Point2 &point) {
    return std::isfinite(point.x) && std::isfinite(point.y);
}

bool samePoint(const msdfgen::Point2 &a, const msdfgen::Point2 &b) {
    return std::abs(a.x-b.x) <= ENDPOINT_EPSILON && std::abs(a.y-b.y) <= ENDPOINT_EPSILON;
}

msdfgen::Point2 pointAt(const double *coordinates, std::uint32_t index) {
    return msdfgen::Point2(coordinates[2*index], coordinates[2*index+1]);
}

} // namespace

extern "C" {

std::uint32_t msdf_abi_version() {
    return ABI_VERSION;
}

std::uint32_t msdf_render_v1(
    std::uint32_t abiVersion,
    const std::uint32_t *contourOffsets,
    std::uint32_t contourCount,
    const std::uint32_t *edgeKinds,
    const double *edgeCoordinates,
    std::uint32_t edgeCount,
    std::uint32_t width,
    std::uint32_t height,
    double scaleX,
    double scaleY,
    double offsetX,
    double offsetY,
    double pixelRange,
    std::uint8_t *output,
    std::uint32_t outputCapacity
) {
    if (abiVersion != ABI_VERSION)
        return STATUS_ABI_MISMATCH;
    if (!contourOffsets || !edgeKinds || !edgeCoordinates || !output || !contourCount || !edgeCount)
        return STATUS_INVALID_ARGUMENT;
    if (edgeCount > MAX_EDGE_COUNT || !width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION)
        return STATUS_INVALID_ARGUMENT;
    if (!(std::isfinite(scaleX) && std::isfinite(scaleY) && std::isfinite(offsetX) && std::isfinite(offsetY) && std::isfinite(pixelRange)))
        return STATUS_INVALID_ARGUMENT;
    if (!(scaleX > 0 && scaleY > 0 && pixelRange > 0))
        return STATUS_INVALID_ARGUMENT;

    const std::uint64_t outputSize = 3ull*width*height;
    if (outputSize > outputCapacity)
        return STATUS_OUTPUT_TOO_SMALL;
    if (contourOffsets[0] != 0 || contourOffsets[contourCount] != edgeCount)
        return STATUS_INVALID_CONTOURS;

    msdfgen::Shape shape;
    for (std::uint32_t contourIndex = 0; contourIndex < contourCount; ++contourIndex) {
        const std::uint32_t firstEdge = contourOffsets[contourIndex];
        const std::uint32_t endEdge = contourOffsets[contourIndex+1];
        if (firstEdge >= endEdge || endEdge > edgeCount)
            return STATUS_INVALID_CONTOURS;

        msdfgen::Contour &contour = shape.addContour();
        msdfgen::Point2 firstPoint;
        msdfgen::Point2 previousEnd;
        for (std::uint32_t edgeIndex = firstEdge; edgeIndex < endEdge; ++edgeIndex) {
            const double *coordinates = edgeCoordinates+8*edgeIndex;
            const msdfgen::Point2 p0 = pointAt(coordinates, 0);
            const msdfgen::Point2 p1 = pointAt(coordinates, 1);
            const msdfgen::Point2 p2 = pointAt(coordinates, 2);
            const msdfgen::Point2 p3 = pointAt(coordinates, 3);
            if (!finitePoint(p0) || !finitePoint(p1) || !finitePoint(p2) || !finitePoint(p3))
                return STATUS_INVALID_ARGUMENT;
            if (edgeIndex == firstEdge)
                firstPoint = p0;
            else if (!samePoint(p0, previousEnd))
                return STATUS_INVALID_CONTOURS;

            switch (edgeKinds[edgeIndex]) {
                case EDGE_LINE:
                    contour.addEdge(msdfgen::EdgeHolder(p0, p1));
                    previousEnd = p1;
                    break;
                case EDGE_QUADRATIC:
                    contour.addEdge(msdfgen::EdgeHolder(p0, p1, p2));
                    previousEnd = p2;
                    break;
                case EDGE_CUBIC:
                    contour.addEdge(msdfgen::EdgeHolder(p0, p1, p2, p3));
                    previousEnd = p3;
                    break;
                default:
                    return STATUS_INVALID_EDGE_KIND;
            }
        }
        if (!samePoint(previousEnd, firstPoint))
            return STATUS_INVALID_CONTOURS;
    }

    if (!shape.validate())
        return STATUS_INVALID_SHAPE;
    shape.orientContours();
    shape.normalize();
    if (!shape.validate())
        return STATUS_INVALID_SHAPE;
    shape.setYAxisOrientation(msdfgen::Y_DOWNWARD);
    msdfgen::edgeColoringSimple(shape, 3.0, 0);

    std::vector<float> bitmap(static_cast<std::size_t>(outputSize));
    const msdfgen::Vector2 scale(scaleX, scaleY);
    const msdfgen::Vector2 translate(offsetX/scaleX, offsetY/scaleY);
    const msdfgen::Range range(2*pixelRange/std::min(scaleX, scaleY));
    const msdfgen::SDFTransformation transformation(
        msdfgen::Projection(scale, translate),
        msdfgen::DistanceMapping(range)
    );
    const msdfgen::ErrorCorrectionConfig errorCorrection(
        msdfgen::ErrorCorrectionConfig::EDGE_PRIORITY,
        msdfgen::ErrorCorrectionConfig::CHECK_DISTANCE_AT_EDGE
    );
    const msdfgen::MSDFGeneratorConfig config(true, errorCorrection);
    msdfgen::BitmapSection<float, 3> target(
        bitmap.data(),
        static_cast<int>(width),
        static_cast<int>(height),
        msdfgen::Y_DOWNWARD
    );
    msdfgen::generateMSDF(target, shape, transformation, config);

    for (std::size_t index = 0; index < outputSize; ++index)
        output[index] = msdfgen::pixelFloatToByte(bitmap[index]);
    return STATUS_OK;
}

} // extern "C"
